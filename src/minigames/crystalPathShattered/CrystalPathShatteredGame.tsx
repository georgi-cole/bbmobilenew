/**
 * Crystal Path: Infinity — lightweight DOM/CSS rework.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Developer notes — what changed vs. the previous Pixi implementation
 * ────────────────────────────────────────────────────────────────────────────
 * Removed (crash/perf hazards):
 *  - Pixi Application, Scene, Graphics/Container/Sprite/Filter hierarchies
 *  - Per-frame ticker callbacks, particle layers, crack/shard FX, full-scene
 *    blur/glow filters, and the large CrystalPathShatteredScene.ts / Stage.tsx
 *  - Dependency on `glassBridgeSlice` for this variant (the original non-Pixi
 *    Crystal Path / GlassBridge is untouched and still owns that slice).
 *
 * Reused from the prior foundation:
 *  - MinigameHost integration (`reactComponentKey: 'CrystalPathShattered'`)
 *  - MinigameCompleteWrapper, applyMinigameWinner, SoundManager SFX hooks
 *  - cryptoSeed + mulberry32 RNG for deterministic-per-session seeding
 *
 * New mechanics (see ./shatteredLogic.ts):
 *  - SP endurance (300 start, -10/-15/-20 by row band, 0 = elimination)
 *  - Hint economy (2 starting hints)
 *  - Mystery center tiles every 3–6 rows with 5-second effects (cap 2 active)
 *  - Secret 350-row win (season immunity hook placeholder)
 *  - Ranking by furthest row, then remaining SP, then survival order.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CompetitionSkillProfile } from '../../ai/competition/types';
import { mulberry32 } from '../../store/rng';
import { useAppDispatch } from '../../store/hooks';
import { applyMinigameWinner } from '../../store/gameSlice';
import { cryptoSeed } from '../../features/riskWheel/cryptoSpin';
import { useGlassBridgeAudio } from '../../hooks/useGlassBridgeAudio';
import MinigameCompleteWrapper from '../../components/MinigameHost/MinigameCompleteWrapper';
import {
  aiPickSide,
  aiShouldTakeMystery,
  aiShouldUseHint,
  applyMysteryEffect,
  buildSummary,
  createRowStream,
  EFFECT_DURATION_MS,
  formatEffectName,
  getRowBandDamage,
  HIDDEN_BRIDGE_LENGTH,
  isPositiveEffect,
  mergeEffect,
  pickAiPersonality,
  pruneEffects,
  rankPlayers,
  resolveWrongTileDelta,
  rollMysteryEffect,
  SAFE_STEP_MS,
  STARTING_HINTS,
  STARTING_SP,
  WRONG_STEP_MS,
  MYSTERY_REVEAL_MS,
  AI_MIN_THINK_MS,
  AI_MAX_THINK_MS,
  NEW_TURN_DELAY_MS,
  type AiPersonality,
  type BridgeRow,
  type PlayerState,
  type TileSide,
} from './shatteredLogic';
import './crystalPathShattered.css';

interface ParticipantInput {
  id: string;
  name: string;
  isHuman: boolean;
  competitionProfile?: CompetitionSkillProfile;
}

interface Props {
  participantIds: string[];
  participants?: ParticipantInput[];
  prizeType?: 'LOH' | 'POS';
  seed?: number;
  onComplete?: () => void;
}

type Phase = 'playing' | 'complete';

interface Animation {
  playerId: string;
  kind: 'safe' | 'wrong' | 'mystery' | 'fall';
  side: TileSide | 'center';
  rowIndex: number;
  until: number;
}

// ─── Dev counters (verifies stability per issue PART 1 §9) ──────────────────
let __sceneInitCount = 0;
let __timerRegistrationCount = 0;
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  interface DebugGlobal { __crystalShattered?: { sceneInits: number; timers: number } }
  (window as unknown as DebugGlobal).__crystalShattered = {
    get sceneInits() { return __sceneInitCount; },
    get timers()     { return __timerRegistrationCount; },
  };
}

/** Fixed-length array for environment particle slots (avoids per-render allocation). */
const PARTICLE_SLOTS = Array.from({ length: 12 });

function initialPlayers(
  participantIds: string[],
  participants: ParticipantInput[] | undefined,
): PlayerState[] {
  return participantIds.map((id) => {
    const p = participants?.find((x) => x.id === id);
    return {
      id,
      name: p?.name ?? id,
      isHuman: p?.isHuman ?? false,
      profile: p?.competitionProfile,
      sp: STARTING_SP,
      hints: STARTING_HINTS,
      furthestRow: 0,
      effects: [],
      eliminated: false,
      eliminatedRow: null,
      finishedAtMs: null,
      survivalIndex: 0,
      // personality stored on state via closure
    } satisfies PlayerState;
  });
}

function initialActivePlayerIndex(
  participantIds: string[],
  participants: ParticipantInput[] | undefined,
): number {
  const humanId = participants?.find((p) => p.isHuman)?.id;
  if (!humanId) return 0;
  const idx = participantIds.indexOf(humanId);
  return idx >= 0 ? idx : 0;
}

function findNextPlayablePlayerIndex(players: PlayerState[], fromIndex: number): number | null {
  if (players.length === 0) return null;
  for (let offset = 1; offset <= players.length; offset += 1) {
    const idx = (fromIndex + offset) % players.length;
    const player = players[idx];
    if (player && !player.eliminated && player.finishedAtMs === null) return idx;
  }
  return null;
}

export default function CrystalPathShatteredGame({
  participantIds,
  participants,
  prizeType = 'LOH',
  seed,
  onComplete,
}: Props) {
  const dispatch = useAppDispatch();
  const { playSafeStep, playDeath, playWinner, playNewTurn } = useGlassBridgeAudio(true);

  // Deterministic-per-session seed (same pattern as GlassBridge).
  const sessionSeed = useMemo(
    () => (seed === 0 || seed === undefined ? cryptoSeed() : seed),
    [seed],
  );
  const rngRef = useRef(mulberry32(sessionSeed));
  const rowStreamRef = useRef(createRowStream(rngRef.current));
  const aiPersonalityRef = useRef<Record<string, AiPersonality>>({});

  // Scene-init counter (Part 1 §9).
  const didInitRef = useRef(false);
  if (!didInitRef.current) {
    didInitRef.current = true;
    __sceneInitCount += 1;
  }

  // ── State ────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('playing');
  const [players, setPlayers] = useState<PlayerState[]>(() =>
    initialPlayers(participantIds, participants),
  );
  const [activePlayerIndex, setActivePlayerIndex] = useState(() =>
    initialActivePlayerIndex(participantIds, participants),
  );
  const [bridgeRows, setBridgeRows] = useState<BridgeRow[]>(() =>
    rowStreamRef.current.take(HIDDEN_BRIDGE_LENGTH),
  );
  const [activeAnimation, setActiveAnimation] = useState<Animation | null>(null);
  const [hintRowIndex, setHintRowIndex] = useState<number | null>(null);
  const [messageLog, setMessageLog] = useState<string[]>([]);
  const [mysteryModal, setMysteryModal] = useState<{ effectLabel: string; positive: boolean } | null>(null);
  const [secretWinBanner, setSecretWinBanner] = useState(false);
  const [spectating, setSpectating] = useState(false);
  // Tick for active-effect countdowns.
  const [, forceTick] = useReducer((x: number) => (x + 1) & 0xffff, 0);
  // Track which row the current player must still step on after taking mystery.
  const [mysteryPendingStep, setMysteryPendingStep] = useState(false);

  // Derived
  const playersRef = useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const humanId = useMemo(
    () => (participants ?? []).find((p) => p.isHuman)?.id ?? null,
    [participants],
  );
  const activePlayer = players[activePlayerIndex] ?? null;
  const activePlayerId = activePlayer?.id ?? null;
  const humanPlayer = humanId ? players.find((p) => p.id === humanId) ?? null : null;
  const isHumanTurn = !!activePlayer && activePlayer.id === humanId;
  const isResolving = activeAnimation !== null || mysteryModal !== null;

  // Determine row the active player is currently approaching (0-based into bridge).
  const currentAbsoluteRow = activePlayer ? activePlayer.furthestRow : 0;
  const currentRowRecord = useMemo(() => {
    return bridgeRows[currentAbsoluteRow] ?? null;
  }, [bridgeRows, currentAbsoluteRow]);

  // Assign AI personalities once.
  useEffect(() => {
    players.forEach((p) => {
      if (!p.isHuman && !aiPersonalityRef.current[p.id]) {
        aiPersonalityRef.current[p.id] = pickAiPersonality(p.profile, rngRef.current);
      }
    });
  }, [players]);

  // ── Timers (registered through a single queue for stability) ─────────────
  const timersRef = useRef<number[]>([]);
  const queueTimeout = useCallback((cb: () => void, ms: number): number => {
    __timerRegistrationCount += 1;
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      cb();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);
  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);
  useEffect(() => () => { clearAllTimers(); }, [clearAllTimers]);

  // Keep effect-countdown UI ticking (cheap 250ms tick while effects alive).
  useEffect(() => {
    const anyActive = players.some((p) => p.effects.length > 0);
    if (!anyActive) return undefined;
    const iv = window.setInterval(() => {
      setPlayers((cur) => {
        const now = Date.now();
        let changed = false;
        const next = cur.map((p) => {
          const pruned = pruneEffects(p.effects, now);
          if (pruned.length !== p.effects.length) changed = true;
          return pruned.length !== p.effects.length ? { ...p, effects: pruned } : p;
        });
        return changed ? next : cur;
      });
      forceTick();
    }, 250);
    return () => window.clearInterval(iv);
  }, [players]);

  // Apply over-time effects (regen/drain) every 500ms while active.
  useEffect(() => {
    const needsTick = players.some((p) =>
      p.effects.some((e) => e.kind === 'regen_5s' || e.kind === 'drain_5s'),
    );
    if (!needsTick) return undefined;
    const iv = window.setInterval(() => {
      setPlayers((cur) => cur.map((p) => {
        if (p.eliminated) return p;
        let delta = 0;
        for (const e of p.effects) {
          if (e.expiresAt <= Date.now()) continue;
          if (e.kind === 'regen_5s') delta += 2;
          if (e.kind === 'drain_5s') delta -= 2;
        }
        if (delta === 0) return p;
        return { ...p, sp: Math.max(0, Math.min(STARTING_SP + 100, p.sp + delta)) };
      }));
    }, 500);
    return () => window.clearInterval(iv);
  }, [players]);

  const advanceToNextPlayer = useCallback((fromIndex: number) => {
    const nextIndex = findNextPlayablePlayerIndex(playersRef.current, fromIndex);
    if (nextIndex !== null) setActivePlayerIndex(nextIndex);
  }, []);

  useEffect(() => {
    if (phase !== 'playing' || !activePlayerId) return;
    playNewTurn();
  }, [activePlayerId, phase, playNewTurn]);

  // ── Turn pump / AI driver ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || !activePlayer || isResolving) return undefined;
    if (activePlayer.isHuman) return undefined;
    // AI turn.
    const personality = aiPersonalityRef.current[activePlayer.id] ?? 'balanced';
    const row = currentRowRecord;
    if (!row) return undefined;

    const thinkMs = AI_MIN_THINK_MS + Math.floor(rngRef.current() * (AI_MAX_THINK_MS - AI_MIN_THINK_MS));
    const timer = queueTimeout(() => {
      // Decide mystery first.
      if (row.hasMystery && !mysteryPendingStep
          && aiShouldTakeMystery(personality, activePlayer.sp, rngRef.current)) {
        resolveMystery(activePlayer.id);
        return;
      }
      // Use hint?
      const useHint = aiShouldUseHint(personality, activePlayer.sp, activePlayer.hints, rngRef.current);
      if (useHint) consumeHint(activePlayer.id);
      // Pick side (hint biases AI toward safeSide).
      const side = useHint
        ? (rngRef.current() < 0.85 ? row.safeSide : (row.safeSide === 'left' ? 'right' : 'left'))
        : aiPickSide(row, personality, rngRef.current);
      resolveStep(activePlayer.id, side, row);
    }, NEW_TURN_DELAY_MS + thinkMs);
    return () => window.clearTimeout(timer);
    // The effect intentionally re-runs only on these stable keys; `row`, `activePlayer`,
    // and the resolver callbacks are captured once per scheduling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlayer, activePlayerId, phase, isResolving, mysteryPendingStep, currentRowRecord]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const logMessage = useCallback((msg: string) => {
    setMessageLog((cur) => [msg, ...cur].slice(0, 4));
  }, []);

  const consumeHint = useCallback((playerId: string) => {
    setPlayers((cur) => cur.map((p) =>
      p.id === playerId && p.hints > 0 ? { ...p, hints: p.hints - 1 } : p,
    ));
    const row = currentRowRecord;
    if (row) setHintRowIndex(row.index);
    // Hint expires on the next step or after 3.5s.
    queueTimeout(() => setHintRowIndex((r) => (r === row?.index ? null : r)), 3_500);
  }, [currentRowRecord, queueTimeout]);

  const resolveStep = useCallback((playerId: string, side: TileSide, row: BridgeRow) => {
    if (!activePlayer || activePlayer.id !== playerId) return;
    const wrong = side !== row.safeSide;
    const now = Date.now();
    setActiveAnimation({
      playerId,
      kind: wrong ? 'wrong' : 'safe',
      side,
      rowIndex: row.index,
      until: now + (wrong ? WRONG_STEP_MS : SAFE_STEP_MS),
    });
    setHintRowIndex(null);
    setMysteryPendingStep(false);

    if (wrong) {
      playDeath();
      const base = getRowBandDamage(row.index + 1);
      const res = resolveWrongTileDelta(base, activePlayer.effects, now);
      const newSp = Math.max(0, activePlayer.sp + res.delta);
      const eliminated = newSp <= 0;
      setPlayers((cur) => cur.map((p) => {
        if (p.id !== playerId) return p;
        if (res.consumedKind === 'shield_5s') logMessage(`${p.name}: Shield absorbed the damage.`);
        if (res.consumedKind === 'lucky_5s') logMessage(`${p.name}: Lucky heal ${base > 0 ? `+${base}` : base} SP.`);
        return {
          ...p,
          sp: newSp,
          effects: res.newEffects,
          eliminated,
          eliminatedRow: eliminated ? row.index + 1 : p.eliminatedRow,
        };
      }));
      queueTimeout(() => {
        setActiveAnimation(null);
        if (eliminated) advanceToNextPlayer(activePlayerIndex);
      }, WRONG_STEP_MS);
    } else {
      playSafeStep();
      const furthest = Math.max(activePlayer.furthestRow, row.index + 1);
      const finished = furthest >= HIDDEN_BRIDGE_LENGTH ? now : activePlayer.finishedAtMs;
      setPlayers((cur) => cur.map((p) => {
        if (p.id !== playerId) return p;
        return { ...p, furthestRow: furthest, finishedAtMs: finished };
      }));
      queueTimeout(() => {
        setActiveAnimation(null);
        if (finished !== null) advanceToNextPlayer(activePlayerIndex);
      }, SAFE_STEP_MS);
    }
  }, [activePlayer, activePlayerIndex, advanceToNextPlayer, logMessage, playDeath, playSafeStep, queueTimeout]);

  const resolveMystery = useCallback((playerId: string) => {
    const row = currentRowRecord;
    if (!row || !row.hasMystery) return;
    const kind = rollMysteryEffect(rngRef.current);
    const applied = applyMysteryEffect(kind, Date.now());
    const positive = isPositiveEffect(kind);

    setActiveAnimation({ playerId, kind: 'mystery', side: 'center', rowIndex: row.index, until: Date.now() + MYSTERY_REVEAL_MS });
    setPlayers((cur) => cur.map((p) => {
      if (p.id !== playerId) return p;
      const now = Date.now();
      const newSp = Math.max(0, p.sp + applied.spDelta);
      const newHints = Math.max(0, p.hints + applied.hintDelta);
      const newEffects = mergeEffect(p.effects, applied.addedEffect, now);
      const eliminated = newSp <= 0;
      return {
        ...p,
        sp: newSp,
        hints: newHints,
        effects: newEffects,
        eliminated,
        eliminatedRow: eliminated ? p.furthestRow + 1 : p.eliminatedRow,
      };
    }));
    // Remove mystery marker from this row so it can't be retaken.
    setBridgeRows((cur) => cur.map((r) => r.index === row.index ? { ...r, hasMystery: false } : r));
    setMysteryPendingStep(true);
    logMessage(`${players.find((p) => p.id === playerId)?.name ?? 'Player'} — Mystery: ${applied.label}.`);

    if (players.find((p) => p.id === playerId)?.isHuman) {
      setMysteryModal({ effectLabel: applied.label, positive });
      queueTimeout(() => setMysteryModal(null), MYSTERY_REVEAL_MS);
    }
    queueTimeout(() => { setActiveAnimation(null); }, MYSTERY_REVEAL_MS);
  }, [currentRowRecord, logMessage, players, queueTimeout]);

  // ── Completion detection ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const secretWinner = players.find((p) => p.finishedAtMs !== null);
    const stillAlive = players.filter((p) => !p.eliminated && p.finishedAtMs === null);
    if (secretWinner || stillAlive.length === 0) {
      if (secretWinner && !secretWinBanner) {
        setSecretWinBanner(true);
        playWinner();
        // Season-immunity hook placeholder — dispatched as a plain log for now.
        if (import.meta.env?.DEV) {
          console.log('[crystalPathShattered] SECRET 350-ROW WIN — season immunity hook', {
            playerId: secretWinner.id,
          });
        }
      }
      // Short delay to let animations settle before showing the complete screen.
      const t = queueTimeout(() => setPhase('complete'), secretWinner ? 1_400 : 600);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [phase, players, playWinner, queueTimeout, secretWinBanner]);

  // Announce human elimination (spectator mode).
  useEffect(() => {
    if (!humanPlayer || spectating || phase !== 'playing') return;
    if (humanPlayer.eliminated) {
      setSpectating(true);
      logMessage('You fell. Spectating remaining players.');
    }
  }, [humanPlayer, spectating, phase, logMessage]);

  // Assign survivalIndex (order-of-fall) whenever a new elimination appears.
  // Stable dep: count of eliminated players without a survivalIndex yet.
  const pendingSurvivalCount = players.reduce(
    (acc, p) => acc + (p.eliminated && p.survivalIndex === 0 ? 1 : 0),
    0,
  );
  useEffect(() => {
    if (pendingSurvivalCount === 0) return;
    setPlayers((cur) => {
      const assigned = cur.filter((p) => p.eliminated && p.survivalIndex > 0).length;
      let nextIdx = assigned + 1;
      let changed = false;
      const next = cur.map((p) => {
        if (p.eliminated && p.survivalIndex === 0) {
          changed = true;
          const result = { ...p, survivalIndex: nextIdx };
          nextIdx += 1;
          return result;
        }
        return p;
      });
      return changed ? next : cur;
    });
  }, [pendingSurvivalCount]);

  // ── Handlers (human UI) ──────────────────────────────────────────────────
  const inputEnabled =
    isHumanTurn && !isResolving && !spectating && phase === 'playing';

  const handleSelect = useCallback((tile: TileKindChoice) => {
    if (!inputEnabled || !activePlayer) return;
    const row = currentRowRecord;
    if (!row) return;
    if (tile === 'center') {
      if (!row.hasMystery || mysteryPendingStep) return;
      resolveMystery(activePlayer.id);
      return;
    }
    resolveStep(activePlayer.id, tile, row);
  }, [inputEnabled, activePlayer, currentRowRecord, mysteryPendingStep, resolveMystery, resolveStep]);

  const handleHint = useCallback(() => {
    if (!inputEnabled || !activePlayer || activePlayer.hints <= 0) return;
    consumeHint(activePlayer.id);
  }, [inputEnabled, activePlayer, consumeHint]);

  // ── Complete screen wiring ───────────────────────────────────────────────
  const handleContinue = useCallback(() => {
    const summary = buildSummary(players);
    if (summary.winnerId) {
      // lastPlaceId = first eliminated = smallest survivalIndex among eliminated.
      const firstOut = [...players]
        .filter((p) => p.eliminated && p.survivalIndex > 0)
        .sort((a, b) => a.survivalIndex - b.survivalIndex)[0]?.id
        ?? null;
      dispatch(applyMinigameWinner({
        winnerId: summary.winnerId,
        lastPlaceId: firstOut,
        lastPlaceType: 'survival',
      }));
    }
    onComplete?.();
  }, [dispatch, onComplete, players]);

  // ── Render ───────────────────────────────────────────────────────────────
  const ranked = useMemo(() => rankPlayers(players), [players]);
  const displayRows = useMemo(() => {
    const absCurrent = activePlayer?.furthestRow ?? 0;
    const startOffset = Math.max(0, absCurrent - 1);
    return bridgeRows.slice(startOffset, startOffset + 6);
  }, [activePlayer, bridgeRows]);

  const activeEffects = activePlayer ? pruneEffects(activePlayer.effects, Date.now()) : [];

  // Prize label for complete screen.
  const prizeLabel = prizeType === 'POS' ? 'Power of Safety' : 'Head of Household';

  // SP color band helper
  const spLevel = (sp: number): 'is-safe' | 'is-warn' | 'is-danger' => {
    const pct = sp / STARTING_SP;
    if (pct > 0.5) return 'is-safe';
    if (pct > 0.2) return 'is-warn';
    return 'is-danger';
  };

  if (phase === 'complete') {
      return (
        <div className="cps-shell" aria-label="Crystal Path: Infinity — complete">
        {/* Environment */}
        <div className="cps-depth-fog" aria-hidden="true" />
        <div className="cps-spotlight" aria-hidden="true" />
        <div className="cps-particles" aria-hidden="true">
          {PARTICLE_SLOTS.map((_, i) => <span key={i} className="cps-particle" />)}
        </div>

        <div className="cps-content">
          <MinigameCompleteWrapper
            className="cps-complete"
            onContinue={handleContinue}
            continueButtonClassName="cps-btn cps-btn-primary"
            placementsClassName="cps-placements"
            placementsRole="list"
            placementsAriaLabel="Final standings"
            placementsNode={ranked.map((p, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
              const detail = p.finishedAtMs !== null
                ? 'Reached the end of the bridge'
                : p.eliminated
                  ? `Fell at row ${p.eliminatedRow ?? 0} · ${p.sp} SP`
                  : `Row ${p.furthestRow} · ${p.sp} SP`;
              return (
                <div key={p.id} className="cps-placement" role="listitem">
                  <span className="cps-medal">{medal}</span>
                  <span className="cps-name">{p.id === humanId ? 'You' : p.name}</span>
                  <span className="cps-detail">{detail}</span>
                </div>
              );
            })}
          >
            <div className="cps-complete-hero">
              <p className="cps-kicker">Crystal Path · Infinity</p>
              <h2>{secretWinBanner ? 'Hidden Path Discovered!' : `${prizeLabel} decided`}</h2>
              <div className="cps-trophy" aria-hidden="true">{secretWinBanner ? '🏆' : '💠'}</div>
              {ranked[0] && (
                <p>
                  {ranked[0].id === humanId ? 'You' : ranked[0].name}
                  {secretWinBanner
                    ? ' crossed the entire bridge and uncovered a secret relic.'
                    : ' endured the longest.'}
                </p>
              )}
            </div>
          </MinigameCompleteWrapper>
        </div>
      </div>
    );
  }

  const currentSp = activePlayer?.sp ?? 0;
  const currentSpPct = Math.max(0, Math.min(100, (currentSp / STARTING_SP) * 100));
  const currentSpLevel = spLevel(currentSp);

  return (
    <div className="cps-shell" aria-label="Crystal Path: Infinity">
      {/* ── Environment (background, not decoration) ─────────────────────── */}
      <div className="cps-depth-fog" aria-hidden="true" />
      <div className="cps-spotlight" aria-hidden="true" />
      <div className="cps-edge-light-left" aria-hidden="true" />
      <div className="cps-edge-light-right" aria-hidden="true" />
      <div className="cps-particles" aria-hidden="true">
        {PARTICLE_SLOTS.map((_, i) => <span key={i} className="cps-particle" />)}
      </div>
      <div className="cps-light-shafts" aria-hidden="true">
        <div className="cps-light-shaft" />
        <div className="cps-light-shaft" />
        <div className="cps-light-shaft" />
      </div>

      {/* ── Content (above environment) ──────────────────────────────────── */}
      <div className="cps-content">
        {/* Header — simplified left/right split */}
        <header className="cps-header">
          <div className="cps-header-left">
            <span className="cps-player-name">
              {activePlayer ? (activePlayer.id === humanId ? 'You' : activePlayer.name) : '—'}
            </span>
            <span className="cps-row-display">Row {(activePlayer?.furthestRow ?? 0) + 1}</span>
          </div>
          <div className="cps-header-right">
            <div className="cps-sp-display">
              <span className="cps-sp-label">SP</span>
              <span className={`cps-sp-value ${currentSpLevel}`}>{currentSp}</span>
            </div>
            <span className="cps-hints-display">{activePlayer?.hints ?? 0}💡</span>
          </div>
        </header>

        {/* SP bar — color-shifting shimmer */}
        <div className={`cps-sp-bar-main${currentSp <= STARTING_SP * 0.2 ? ' is-low' : ''}`} aria-label={`${currentSp} SP`}>
          <div className={`cps-sp-bar-fill ${currentSpLevel}`} style={{ width: `${currentSpPct}%` }} />
        </div>

        {/* Active effects — countdown chips */}
        {activeEffects.length > 0 && (
          <div className="cps-effects" aria-label="Active effects">
            {activeEffects.map((e, idx) => {
              const remaining = Math.max(0, e.expiresAt - Date.now());
              const pct = Math.min(100, Math.round((remaining / EFFECT_DURATION_MS) * 100));
              return (
                <span
                  key={`${e.kind}-${idx}`}
                  className={`cps-effect ${isPositiveEffect(e.kind) ? 'is-pos' : 'is-neg'}`}
                >
                  <span className="cps-effect-name">{formatEffectName(e.kind)}</span>
                  <span className="cps-effect-timer">{Math.ceil(remaining / 1000)}s</span>
                  <span className="cps-effect-bar" style={{ width: `${pct}%` }} aria-hidden="true" />
                </span>
              );
            })}
          </div>
        )}

        {/* Board — 3D perspective runway */}
        <section className="cps-board" aria-label="Bridge">
          <div className="cps-bridge-track">
            {displayRows.map((row) => {
              const isCurrent = activePlayer && row.index === activePlayer.furthestRow;
              const isPast = activePlayer && row.index < activePlayer.furthestRow;
              const showHint = hintRowIndex === row.index;
              const anim = activeAnimation && activeAnimation.rowIndex === row.index
                ? activeAnimation
                : null;
              const blockForMystery = mysteryPendingStep && row.hasMystery;
              return (
                <div
                  key={row.index}
                  className={`cps-row${isCurrent ? ' is-current' : ''}${isPast ? ' is-past' : ''}`}
                >
                  <button
                    type="button"
                    className={`cps-tile cps-tile-left${showHint && row.safeSide === 'left' ? ' is-hinted' : ''}${anim && anim.side === 'left' ? (anim.kind === 'wrong' ? ' is-wrong' : ' is-safe') : ''}`}
                    onClick={() => handleSelect('left')}
                    disabled={!isCurrent || !inputEnabled || blockForMystery}
                    aria-label={`Row ${row.index + 1} left tile`}
                  />
                  <div className={`cps-center${row.hasMystery ? ' has-mystery' : ''}`}>
                    {row.hasMystery && !mysteryPendingStep && (
                      <button
                        type="button"
                        className={`cps-tile cps-tile-center${anim && anim.side === 'center' ? ' is-mystery' : ''}`}
                        onClick={() => handleSelect('center')}
                        disabled={!isCurrent || !inputEnabled}
                        aria-label={`Row ${row.index + 1} mystery tile`}
                      >
                        <span aria-hidden="true">?</span>
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`cps-tile cps-tile-right${showHint && row.safeSide === 'right' ? ' is-hinted' : ''}${anim && anim.side === 'right' ? (anim.kind === 'wrong' ? ' is-wrong' : ' is-safe') : ''}`}
                    onClick={() => handleSelect('right')}
                    disabled={!isCurrent || !inputEnabled || blockForMystery}
                    aria-label={`Row ${row.index + 1} right tile`}
                  />
                  <div className="cps-row-label" aria-hidden="true">{row.index + 1}</div>
                </div>
              );
            })}

            {/* Reflection — mirrored faint bridge beneath */}
            <div className="cps-bridge-reflection" aria-hidden="true">
              {displayRows.slice(0, 3).map((row) => (
                <div key={`ref-${row.index}`} className="cps-row">
                  <div className="cps-tile" />
                  <div className="cps-center" />
                  <div className="cps-tile" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Controls */}
        <div className="cps-controls">
          <div className="cps-status" role="status">
            {spectating
              ? 'Spectating…'
              : mysteryPendingStep
                ? 'Now choose LEFT or RIGHT to advance.'
                : isHumanTurn
                  ? (currentRowRecord?.hasMystery
                      ? 'Keep climbing — choose LEFT, RIGHT, or take the ❓ detour.'
                      : 'Keep climbing — choose LEFT or RIGHT.')
                  : `${activePlayer?.name ?? '—'} keeps climbing…`}
          </div>
          <button
            type="button"
            className="cps-hint-btn"
            onClick={handleHint}
            disabled={!inputEnabled || (activePlayer?.hints ?? 0) <= 0}
            aria-label={`Use hint (${activePlayer?.hints ?? 0} remaining)`}
          >
            👁
            <span className="cps-hint-count">{activePlayer?.hints ?? 0}</span>
          </button>
        </div>

        {/* Message log */}
        {messageLog.length > 0 && (
          <div className="cps-log" aria-live="polite">
            {messageLog.map((m, idx) => <p key={idx}>{m}</p>)}
          </div>
        )}

        {/* Standings */}
        <section className="cps-standings" aria-label="Players">
          {ranked.map((p) => {
            const pSpPct = Math.max(0, Math.min(100, (p.sp / STARTING_SP) * 100));
            const pSpLevel = spLevel(p.sp);
            return (
              <article
                key={p.id}
                className={`cps-standing${p.id === activePlayerId ? ' is-active' : ''}${p.eliminated ? ' is-out' : ''}`}
              >
                <header>
                  <strong>{p.id === humanId ? 'You' : p.name}</strong>
                  <span>{p.eliminated ? 'Fallen' : p.finishedAtMs !== null ? 'Endured' : `Row ${p.furthestRow}`}</span>
                </header>
                <div className="cps-sp-bar" aria-label={`${p.sp} SP`}>
                  <div className={`cps-sp-fill ${pSpLevel}`} style={{ width: `${pSpPct}%` }} />
                  <span>{p.sp} SP · {p.hints}💡</span>
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {/* Mystery reveal modal (brief) */}
      {mysteryModal && (
        <div className="cps-modal" role="dialog" aria-modal="true" aria-label="Mystery result">
          <div className={`cps-modal-card ${mysteryModal.positive ? 'is-pos' : 'is-neg'}`}>
            <div className="cps-modal-icon" aria-hidden="true">{mysteryModal.positive ? '✨' : '⚠️'}</div>
            <h3>{mysteryModal.effectLabel}</h3>
            <p>{mysteryModal.positive ? 'The chamber smiles on you.' : 'The chamber tests you.'}</p>
          </div>
        </div>
      )}

      {/* Secret win banner */}
      {secretWinBanner && (
        <div className="cps-secret-banner" role="status">
          🏆 Hidden path discovered! Season immunity unlocked.
        </div>
      )}
    </div>
  );
}

type TileKindChoice = TileSide | 'center';
