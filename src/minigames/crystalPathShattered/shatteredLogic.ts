/**
 * Crystal Path: Shattered — pure gameplay logic.
 *
 * This module replaces the previous Pixi-based Crystal Path: Shattered
 * implementation. See docs in ./README-NOTES (inline below) for a summary
 * of what was simplified and why.
 *
 * Design summary (see issue for full spec):
 *  - SP (Stability Points) endurance model replaces instant-death.
 *  - Start: 300 SP, 2 hints.
 *  - Wrong-tile damage by row band:
 *      rows 1–10   → -10
 *      rows 11–25  → -15
 *      rows 26+    → -20
 *  - Correct tile: no SP change.
 *  - Mystery center tile: optional detour every 3–6 rows, does not advance the row.
 *  - Mystery tiles grant 5-second temporary effects (cap 2 simultaneous).
 *  - Bridge is secretly 350 rows long; the board recycles a sliding window so it
 *    visually feels endless. Reaching row 350 is a hidden easter-egg win.
 *  - Ranking: furthest row reached, then remaining SP, then survival order.
 */
import type { CompetitionSkillProfile } from '../../ai/competition/types';

export type TileSide = 'left' | 'right';
export type TileKind = TileSide | 'center';

/** Length of the hidden bridge. Reaching this row triggers the secret win. */
export const HIDDEN_BRIDGE_LENGTH = 350;

/** Starting resources. */
export const STARTING_SP = 300;
export const STARTING_HINTS = 2;

/** Temporary-effect window (ms) per issue spec. */
export const EFFECT_DURATION_MS = 5_000;
/** Cap on simultaneous active effects. */
export const MAX_ACTIVE_EFFECTS = 2;

/** Mystery-tile cadence: spawns every [min, max] rows, randomized. */
export const MYSTERY_MIN_GAP = 3;
export const MYSTERY_MAX_GAP = 6;

/** How many rows of the bridge are materialised/visible at once. */
export const VISIBLE_ROW_WINDOW = 8;

/** Turn pacing. */
export const SAFE_STEP_MS = 420;
export const WRONG_STEP_MS = 720;
export const MYSTERY_REVEAL_MS = 900;
export const AI_MIN_THINK_MS = 320;
export const AI_MAX_THINK_MS = 1_300;
export const NEW_TURN_DELAY_MS = 520;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BridgeRow {
  index: number; // 0-based row index into the (hidden) 350-row bridge
  safeSide: TileSide;
  /** true if the row also presents a mystery center tile. */
  hasMystery: boolean;
}

export type EffectKind =
  // positive
  | 'heal_10'
  | 'heal_20'
  | 'gain_hint'
  | 'shield_5s'        // first wrong tile in window deals 0 damage
  | 'regen_5s'         // small SP/second over window
  | 'lucky_5s'         // next wrong tile heals instead of hurts
  // negative
  | 'hurt_10'
  | 'hurt_15'
  | 'lose_hint'
  | 'fragility_5s'     // next wrong tile deals extra damage
  | 'drain_5s'         // small SP/second drain over window
  // neutral / chaos
  | 'inversion_5s';    // wrong tiles heal instead of hurt for 5s

export interface ActiveEffect {
  kind: EffectKind;
  expiresAt: number; // Date.now() ms
}

export interface PlayerState {
  id: string;
  name: string;
  isHuman: boolean;
  profile?: CompetitionSkillProfile;
  sp: number;
  hints: number;
  furthestRow: number;      // 0 = on platform, n = cleared row n
  effects: ActiveEffect[];
  eliminated: boolean;
  eliminatedRow: number | null;
  finishedAtMs: number | null; // set if reached HIDDEN_BRIDGE_LENGTH (secret win)
  survivalIndex: number;    // tiebreaker: order-of-fall (0 = first out)
}

export interface ShatteredGameSummary {
  placements: string[];              // ordered by rank (best first)
  winnerId: string;
  secretWinner: boolean;             // true if any player reached row 350
  finalSp: Record<string, number>;
  furthestRow: Record<string, number>;
}

// ─── Row generation (deterministic via provided rng) ────────────────────────

/**
 * Stateful row stream — ensures mystery spacing is preserved as the visible
 * window slides forward. The caller pulls `take(n)` rows as the active player
 * advances; earlier rows can be discarded.
 */
export function createRowStream(rng: () => number) {
  let nextIndex = 0;
  let nextMystery = MYSTERY_MIN_GAP
    + Math.floor(rng() * (MYSTERY_MAX_GAP - MYSTERY_MIN_GAP + 1));

  return {
    take(count: number): BridgeRow[] {
      const out: BridgeRow[] = [];
      for (let i = 0; i < count; i += 1) {
        const index = nextIndex;
        nextIndex += 1;
        const safeSide: TileSide = rng() < 0.5 ? 'left' : 'right';
        let hasMystery = false;
        if (index === nextMystery && index < HIDDEN_BRIDGE_LENGTH) {
          hasMystery = true;
          nextMystery = index + MYSTERY_MIN_GAP
            + Math.floor(rng() * (MYSTERY_MAX_GAP - MYSTERY_MIN_GAP + 1));
        }
        out.push({ index, safeSide, hasMystery });
      }
      return out;
    },
    peekNextIndex: () => nextIndex,
  };
}

// ─── Damage & scoring ───────────────────────────────────────────────────────

/**
 * Base wrong-tile SP damage by row band (1-based row number).
 * rows 1–10 → 10, 11–25 → 15, 26+ → 20.
 */
export function getRowBandDamage(oneBasedRow: number): number {
  if (oneBasedRow <= 10) return 10;
  if (oneBasedRow <= 25) return 15;
  return 20;
}

/**
 * Apply active-effect modifiers to a wrong-tile damage event.
 * Returns the signed SP delta to apply (negative = damage, positive = heal).
 * Consumes one-shot effects from the effects list (via returned newEffects).
 */
export function resolveWrongTileDelta(
  baseDamage: number,
  effects: ActiveEffect[],
  now: number,
): { delta: number; newEffects: ActiveEffect[]; consumedKind?: EffectKind } {
  const alive = effects.filter((e) => e.expiresAt > now);
  // Priority: shield absorbs first; lucky heals; inversion heals; fragility doubles.
  const shield = alive.find((e) => e.kind === 'shield_5s');
  if (shield) {
    return { delta: 0, newEffects: alive.filter((e) => e !== shield), consumedKind: 'shield_5s' };
  }
  const lucky = alive.find((e) => e.kind === 'lucky_5s');
  if (lucky) {
    return { delta: baseDamage, newEffects: alive.filter((e) => e !== lucky), consumedKind: 'lucky_5s' };
  }
  const inversion = alive.find((e) => e.kind === 'inversion_5s');
  if (inversion) {
    return { delta: Math.floor(baseDamage / 2), newEffects: alive };
  }
  const fragility = alive.find((e) => e.kind === 'fragility_5s');
  if (fragility) {
    return { delta: -(baseDamage * 2), newEffects: alive.filter((e) => e !== fragility), consumedKind: 'fragility_5s' };
  }
  return { delta: -baseDamage, newEffects: alive };
}

/** Convenience: prune expired effects. */
export function pruneEffects(effects: ActiveEffect[], now: number): ActiveEffect[] {
  return effects.filter((e) => e.expiresAt > now);
}

// ─── Mystery effects ────────────────────────────────────────────────────────

/** Weighted mystery-outcome table (moderate, not extreme). */
const MYSTERY_TABLE: Array<{ kind: EffectKind; weight: number }> = [
  { kind: 'heal_10',        weight: 14 },
  { kind: 'heal_20',        weight: 8  },
  { kind: 'gain_hint',      weight: 10 },
  { kind: 'shield_5s',      weight: 10 },
  { kind: 'regen_5s',       weight: 8  },
  { kind: 'lucky_5s',       weight: 7  },
  { kind: 'hurt_10',        weight: 12 },
  { kind: 'hurt_15',        weight: 7  },
  { kind: 'lose_hint',      weight: 6  },
  { kind: 'fragility_5s',   weight: 7  },
  { kind: 'drain_5s',       weight: 5  },
  { kind: 'inversion_5s',   weight: 6  },
];

export function rollMysteryEffect(rng: () => number): EffectKind {
  const total = MYSTERY_TABLE.reduce((acc, row) => acc + row.weight, 0);
  let roll = rng() * total;
  for (const row of MYSTERY_TABLE) {
    if (roll < row.weight) return row.kind;
    roll -= row.weight;
  }
  return MYSTERY_TABLE[0].kind;
}

export interface MysteryApplied {
  spDelta: number;
  hintDelta: number;
  addedEffect: ActiveEffect | null;
  label: string;
}

/**
 * Apply a rolled mystery effect to produce state-delta payload.
 * Timed effects become ActiveEffect entries capped at MAX_ACTIVE_EFFECTS.
 */
export function applyMysteryEffect(kind: EffectKind, now: number): MysteryApplied {
  switch (kind) {
    case 'heal_10':       return { spDelta:  10, hintDelta: 0, addedEffect: null, label: '+10 SP' };
    case 'heal_20':       return { spDelta:  20, hintDelta: 0, addedEffect: null, label: '+20 SP' };
    case 'gain_hint':     return { spDelta:   0, hintDelta: 1, addedEffect: null, label: '+1 Hint' };
    case 'hurt_10':       return { spDelta: -10, hintDelta: 0, addedEffect: null, label: '-10 SP' };
    case 'hurt_15':       return { spDelta: -15, hintDelta: 0, addedEffect: null, label: '-15 SP' };
    case 'lose_hint':     return { spDelta:   0, hintDelta: -1, addedEffect: null, label: '-1 Hint' };
    case 'shield_5s':     return { spDelta: 0, hintDelta: 0, addedEffect: { kind, expiresAt: now + EFFECT_DURATION_MS }, label: 'Shield 5s' };
    case 'regen_5s':      return { spDelta: 0, hintDelta: 0, addedEffect: { kind, expiresAt: now + EFFECT_DURATION_MS }, label: 'Regen 5s' };
    case 'lucky_5s':      return { spDelta: 0, hintDelta: 0, addedEffect: { kind, expiresAt: now + EFFECT_DURATION_MS }, label: 'Lucky 5s' };
    case 'fragility_5s':  return { spDelta: 0, hintDelta: 0, addedEffect: { kind, expiresAt: now + EFFECT_DURATION_MS }, label: 'Fragility 5s' };
    case 'drain_5s':      return { spDelta: 0, hintDelta: 0, addedEffect: { kind, expiresAt: now + EFFECT_DURATION_MS }, label: 'Drain 5s' };
    case 'inversion_5s':  return { spDelta: 0, hintDelta: 0, addedEffect: { kind, expiresAt: now + EFFECT_DURATION_MS }, label: 'Inversion 5s' };
  }
}

export function mergeEffect(
  effects: ActiveEffect[],
  added: ActiveEffect | null,
  now: number,
): ActiveEffect[] {
  const alive = pruneEffects(effects, now);
  if (!added) return alive;
  if (alive.length >= MAX_ACTIVE_EFFECTS) {
    // drop the soonest-expiring to make room
    const sorted = [...alive].sort((a, b) => a.expiresAt - b.expiresAt);
    sorted.shift();
    return [...sorted, added];
  }
  return [...alive, added];
}

// ─── AI ─────────────────────────────────────────────────────────────────────

export type AiPersonality = 'cautious' | 'balanced' | 'gambler';

export function pickAiPersonality(profile: CompetitionSkillProfile | undefined, rng: () => number): AiPersonality {
  // Map profile traits loosely, else random.
  if (profile) {
    const nerve = profile.nerve ?? 0.5;
    if (nerve > 0.7) return 'gambler';
    if (nerve < 0.35) return 'cautious';
    return 'balanced';
  }
  const r = rng();
  if (r < 0.33) return 'cautious';
  if (r < 0.66) return 'balanced';
  return 'gambler';
}

/** Decide if AI takes the mystery tile (when present). */
export function aiShouldTakeMystery(
  personality: AiPersonality,
  sp: number,
  rng: () => number,
): boolean {
  const lowSp = sp < 120;
  if (personality === 'cautious') return !lowSp && rng() < 0.15;
  if (personality === 'gambler') return rng() < (lowSp ? 0.7 : 0.55);
  return rng() < (lowSp ? 0.25 : 0.35);
}

/** AI picks left/right. Hint usage handled separately. */
export function aiPickSide(
  row: BridgeRow,
  personality: AiPersonality,
  rng: () => number,
): TileSide {
  // 50/50 baseline with small personality skew (gamblers guess more "confidently").
  const correctChance = personality === 'gambler' ? 0.52 : personality === 'cautious' ? 0.5 : 0.51;
  return rng() < correctChance ? row.safeSide : (row.safeSide === 'left' ? 'right' : 'left');
}

/** AI hint decision — burns hints more aggressively when SP is low. */
export function aiShouldUseHint(
  personality: AiPersonality,
  sp: number,
  hints: number,
  rng: () => number,
): boolean {
  if (hints <= 0) return false;
  const lowSp = sp < 100;
  if (personality === 'cautious') return lowSp || rng() < 0.35;
  if (personality === 'gambler')  return lowSp && rng() < 0.4;
  return lowSp ? rng() < 0.75 : rng() < 0.2;
}

// ─── Ranking ────────────────────────────────────────────────────────────────

/**
 * Rank players by:
 *   1. furthest row reached (desc)
 *   2. remaining SP (desc)
 *   3. survivalIndex (desc — survived longer).
 * Secret-win (finishedAtMs set) always ranks first.
 */
export function rankPlayers(players: PlayerState[]): PlayerState[] {
  return [...players].sort((a, b) => {
    if (a.finishedAtMs !== null && b.finishedAtMs === null) return -1;
    if (b.finishedAtMs !== null && a.finishedAtMs === null) return 1;
    if (a.finishedAtMs !== null && b.finishedAtMs !== null) {
      return a.finishedAtMs - b.finishedAtMs;
    }
    if (b.furthestRow !== a.furthestRow) return b.furthestRow - a.furthestRow;
    if (b.sp !== a.sp) return b.sp - a.sp;
    return b.survivalIndex - a.survivalIndex;
  });
}

export function buildSummary(players: PlayerState[]): ShatteredGameSummary {
  const ranked = rankPlayers(players);
  const secretWinner = ranked[0]?.finishedAtMs !== null;
  return {
    placements: ranked.map((p) => p.id),
    winnerId: ranked[0]?.id ?? '',
    secretWinner,
    finalSp: Object.fromEntries(players.map((p) => [p.id, p.sp])),
    furthestRow: Object.fromEntries(players.map((p) => [p.id, p.furthestRow])),
  };
}

// ─── Formatters ─────────────────────────────────────────────────────────────

export function formatEffectName(kind: EffectKind): string {
  switch (kind) {
    case 'heal_10':      return '+10 SP';
    case 'heal_20':      return '+20 SP';
    case 'gain_hint':    return '+1 Hint';
    case 'hurt_10':      return '-10 SP';
    case 'hurt_15':      return '-15 SP';
    case 'lose_hint':    return '-1 Hint';
    case 'shield_5s':    return 'Shield';
    case 'regen_5s':     return 'Regen';
    case 'lucky_5s':     return 'Lucky';
    case 'fragility_5s': return 'Fragility';
    case 'drain_5s':     return 'Drain';
    case 'inversion_5s': return 'Inversion';
  }
}

export function isPositiveEffect(kind: EffectKind): boolean {
  return kind === 'heal_10'
    || kind === 'heal_20'
    || kind === 'gain_hint'
    || kind === 'shield_5s'
    || kind === 'regen_5s'
    || kind === 'lucky_5s';
}
