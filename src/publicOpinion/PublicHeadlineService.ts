/**
 * PublicHeadlineService
 *
 * Generates 2–3 dramatic daily audience-reaction events (headline events) that
 * can produce large approval swings (up to ~30 points for "shocking" severity).
 *
 * Non-spotlighted players receive smaller hidden background drift (up to ±8
 * points) so every player's approval moves meaningfully every day even without
 * a headline.
 *
 * Design:
 *  - Template pool covers backlash, fan-support, viral clips, scandals,
 *    redemption arcs, rumour blowups, showmance waves, etc.
 *  - Severity bands: mild (3–8), dramatic (9–18), shocking (19–30).
 *  - Weighted random severity draw per event.
 *  - All randomness is derived from the seeded RNG so results are deterministic.
 */

import { mulberry32 } from '../store/rng';
import { publicOpinionConfig } from './publicOpinionConfig';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HeadlineSeverity = 'mild' | 'dramatic' | 'shocking';
export type HeadlineTone = 'positive' | 'negative' | 'drama';

export interface HeadlineTemplate {
  key: string;
  tone: HeadlineTone;
  /** If true a relatedName must be supplied. */
  requiresRelated: boolean;
  build: (playerName: string, relatedName?: string) => string;
}

export interface HeadlineEvent {
  playerId: string;
  /** Signed approval delta (positive = gain, negative = loss). */
  delta: number;
  severity: HeadlineSeverity;
  tone: HeadlineTone;
  text: string;
  /** Reason key forwarded to createPublicNarrative. */
  reason: string;
}

// ── Template pool ─────────────────────────────────────────────────────────────

const HEADLINE_TEMPLATES: HeadlineTemplate[] = [
  // Positive templates
  {
    key: 'viral_moment',
    tone: 'positive',
    requiresRelated: false,
    build: (p) =>
      `A clip of ${p} went viral overnight and fans are absolutely obsessed — the support is staggering.`,
  },
  {
    key: 'fan_wave',
    tone: 'positive',
    requiresRelated: false,
    build: (p) =>
      `Fan accounts everywhere are rallying behind ${p}. The swell of public support is almost deafening.`,
  },
  {
    key: 'redemption_arc',
    tone: 'positive',
    requiresRelated: true,
    build: (p, r) =>
      `${p} made things right with ${r ?? 'a player'} in full view of the cameras, and viewers are calling it the season's best moment.`,
  },
  {
    key: 'underdog_love',
    tone: 'positive',
    requiresRelated: false,
    build: (p) =>
      `Underdog energy is radiating off ${p} right now — the public is pouring goodwill into every comment section.`,
  },
  {
    key: 'showmance_surge',
    tone: 'positive',
    requiresRelated: true,
    build: (p, r) =>
      `The ${p} and ${r ?? 'mystery'} storyline just exploded across social media. Viewers are shipping it hard.`,
  },
  {
    key: 'loyal_stand',
    tone: 'positive',
    requiresRelated: true,
    build: (p, r) =>
      `${p} stood up for ${r ?? 'an ally'} when no one else would. The crowd is rewarding that loyalty loudly.`,
  },
  {
    key: 'clutch_comp',
    tone: 'positive',
    requiresRelated: false,
    build: (p) =>
      `${p} came through in a huge moment and the audience cannot stop talking about it.`,
  },
  {
    key: 'wholesome_exchange',
    tone: 'positive',
    requiresRelated: true,
    build: (p, r) =>
      `A heartwarming exchange between ${p} and ${r ?? 'a player'} made the highlight reel and fans are melting.`,
  },
  {
    key: 'bold_honesty',
    tone: 'positive',
    requiresRelated: false,
    build: (p) =>
      `${p} told the truth when it would have been easier to stay quiet, and the audience is rewarding every ounce of that courage.`,
  },
  {
    key: 'comeback_moment',
    tone: 'positive',
    requiresRelated: false,
    build: (p) =>
      `${p} looked finished and came all the way back — the crowd is treating this as the season's defining turnaround.`,
  },

  // Negative templates
  {
    key: 'backstab_exposed',
    tone: 'negative',
    requiresRelated: true,
    build: (p, r) =>
      `The public is outraged after footage surfaced of ${p} talking behind ${r ?? 'a player'}'s back. The backlash is immense.`,
  },
  {
    key: 'rumour_blowup',
    tone: 'negative',
    requiresRelated: true,
    build: (p, r) =>
      `${p} started a rumour about ${r ?? 'someone'} that spiralled out of control. Viewers are not impressed.`,
  },
  {
    key: 'fan_backlash',
    tone: 'negative',
    requiresRelated: false,
    build: (p) =>
      `A wave of public backlash hit ${p} after a clip circulated that left a very bad impression on viewers.`,
  },
  {
    key: 'betrayal_clip',
    tone: 'negative',
    requiresRelated: true,
    build: (p, r) =>
      `${p}'s betrayal of ${r ?? 'a close ally'} is all over social media and the sentiment is scalding.`,
  },
  {
    key: 'villain_edit',
    tone: 'negative',
    requiresRelated: false,
    build: (p) =>
      `The internet has officially assigned a villain label to ${p} this week, and the comments are relentless.`,
  },
  {
    key: 'leaked_cruelty',
    tone: 'negative',
    requiresRelated: true,
    build: (p, r) =>
      `Footage of ${p} being needlessly cruel to ${r ?? 'a player'} leaked and the public reaction has been furious.`,
  },
  {
    key: 'broken_promise',
    tone: 'negative',
    requiresRelated: true,
    build: (p, r) =>
      `${p} broke a very public promise to ${r ?? 'an ally'} and the audience is making their feelings known loudly.`,
  },
  {
    key: 'target_beloved',
    tone: 'negative',
    requiresRelated: true,
    build: (p, r) =>
      `${p} went after fan-favourite ${r ?? 'a beloved player'} and the crowd has turned on them in record time.`,
  },
  {
    key: 'coward_read',
    tone: 'negative',
    requiresRelated: false,
    build: (p) =>
      `Viewers are calling ${p} a coward after a very visible moment of hiding behind other people.`,
  },
  {
    key: 'manipulator_read',
    tone: 'negative',
    requiresRelated: false,
    build: (p) =>
      `${p}'s manipulation tactics got spotlighted by the fan community and the fallout is significant.`,
  },

  // Drama / mixed tone templates (can go either way)
  {
    key: 'explosive_fight',
    tone: 'drama',
    requiresRelated: true,
    build: (p, r) =>
      `${p} and ${r ?? 'a player'} had an explosive confrontation that crashed the live-feed forums. The audience is gripped.`,
  },
  {
    key: 'blindside_play',
    tone: 'drama',
    requiresRelated: false,
    build: (p) =>
      `${p} pulled off a blindside nobody saw coming. Social media is split — half are calling it iconic, half are calling it cold.`,
  },
  {
    key: 'shocking_alliance',
    tone: 'drama',
    requiresRelated: true,
    build: (p, r) =>
      `${p} and ${r ?? 'an unlikely ally'} secretly teaming up just became the season's biggest twist. Viewers cannot decide how to feel.`,
  },
  {
    key: 'chaos_move',
    tone: 'drama',
    requiresRelated: false,
    build: (p) =>
      `${p} threw the house into absolute chaos this week and the audience is here for every second of the fallout.`,
  },
  {
    key: 'tea_spill',
    tone: 'drama',
    requiresRelated: true,
    build: (p, r) =>
      `${p} spilled the tea on ${r ?? 'a player'} in spectacular fashion and the fan community has not moved on since.`,
  },
];

// Headlines without a matching Reality event may describe audience sentiment,
// but must not invent a relationship, promise, rumour, betrayal, or ceremony.
// Event-specific public stories are projected from the Reality event ledger.
const BACKGROUND_SAFE_HEADLINE_KEYS = new Set([
  'viral_moment',
  'fan_wave',
  'underdog_love',
  'fan_backlash',
  'villain_edit',
]);

const BACKGROUND_SAFE_HEADLINE_TEMPLATES = HEADLINE_TEMPLATES.filter(
  (template) => BACKGROUND_SAFE_HEADLINE_KEYS.has(template.key) && !template.requiresRelated,
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Pick a severity band using a weighted random draw. Returns a HeadlineSeverity ('mild' | 'dramatic' | 'shocking'). */
function pickSeverityIndex(rand: () => number): HeadlineSeverity {
  const { mild, dramatic } = publicOpinionConfig.headlineSeverityWeights;
  const roll = rand();
  if (roll < mild) return 'mild';
  if (roll < mild + dramatic) return 'dramatic';
  return 'shocking';
}

function severityMagnitude(severity: HeadlineSeverity, rand: () => number): number {
  const band = publicOpinionConfig.headlineSeverityBands[severity];
  return Math.round(band.minMag + rand() * (band.maxMag - band.minMag));
}

function toneToReason(tone: HeadlineTone, positive: boolean): string {
  if (tone === 'drama') return 'headline_drama';
  return positive ? 'headline_positive' : 'headline_negative';
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GenerateHeadlinesParams {
  activePlayers: Array<{ id: string; name: string }>;
  week: number;
  seed: number;
  /** Override: how many headline events to generate (default from config). */
  count?: number;
  /** Override: player IDs that are ineligible this day (already handled elsewhere). */
  excludeIds?: string[];
}

export interface DailyPublicUpdate {
  /** Players receiving a visible headline event. */
  headlineEvents: HeadlineEvent[];
  /** Background drift applied to players NOT in headlineEvents. */
  backgroundDrifts: Array<{ playerId: string; delta: number }>;
}

/**
 * Generate the full daily public-sentiment update:
 * - 2–3 dramatic headline events for randomly selected players,
 * - Background drift (±backgroundDriftMax) for every other active player.
 */
export function generateDailyPublicUpdate(params: GenerateHeadlinesParams): DailyPublicUpdate {
  const {
    activePlayers,
    week,
    seed,
    count,
    excludeIds = [],
  } = params;

  if (activePlayers.length === 0) {
    return { headlineEvents: [], backgroundDrifts: [] };
  }

  // Bit-mixing constants (Knuth's multiplicative hash / dead-beef marker) are used
  // here to perturb the seed differently from other RNG callsites in the codebase
  // so that headline events and direction generation don't share identical sequences.
  const rng = mulberry32(((seed ^ (week * 0x9e3779b9) ^ 0xdeadbeef) >>> 0));

  const eligible = activePlayers.filter((p) => !excludeIds.includes(p.id));

  // If count is explicitly provided use it; otherwise pick a seeded random count
  // in [headlineEventsPerDayMin, headlineEventsPerDayMax] so the number of daily
  // headline events varies naturally (2 or 3) rather than being fixed at 3.
  const { headlineEventsPerDayMin, headlineEventsPerDayMax } = publicOpinionConfig;
  const targetCount = count !== undefined
    ? count
    : headlineEventsPerDayMin +
      Math.floor(rng() * (headlineEventsPerDayMax - headlineEventsPerDayMin + 1));

  const headlineCount = Math.min(targetCount, eligible.length);

  // Shuffle eligible players using Fisher-Yates
  const shuffled = [...eligible];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const spotlighted = shuffled.slice(0, headlineCount);
  const spotlightedIds = new Set(spotlighted.map((p) => p.id));

  // Build headline events
  const headlineEvents: HeadlineEvent[] = spotlighted.map((player) => {
    const severity = pickSeverityIndex(rng);
    const magnitude = severityMagnitude(severity, rng);

    // Pick a template
    const templateIndex = Math.floor(rng() * BACKGROUND_SAFE_HEADLINE_TEMPLATES.length);
    const template = BACKGROUND_SAFE_HEADLINE_TEMPLATES[templateIndex];

    // Determine sign based on template tone
    let positive: boolean;
    if (template.tone === 'positive') {
      positive = true;
    } else if (template.tone === 'negative') {
      positive = false;
    } else {
      // drama: coin flip
      positive = rng() > 0.5;
    }

    const delta = positive ? magnitude : -magnitude;

    // Pick a related player if the template needs one
    let relatedName: string | undefined;
    if (template.requiresRelated) {
      const others = activePlayers.filter((p) => p.id !== player.id);
      if (others.length > 0) {
        const relatedIndex = Math.floor(rng() * others.length);
        relatedName = others[relatedIndex].name;
      }
    }

    const text = template.build(player.name, relatedName);
    const reason = toneToReason(template.tone, positive);

    return { playerId: player.id, delta, severity, tone: template.tone, text, reason };
  });

  // Background drift: integer in [1, backgroundDriftMax] then assign a random sign.
  // Using Math.floor(rng() * max) + 1 ensures every non-spotlighted player receives
  // at least 1 point of movement each day — no player is static.
  const backgroundDrifts = activePlayers
    .filter((p) => !spotlightedIds.has(p.id))
    .map((p) => {
      const maxDrift = publicOpinionConfig.backgroundDriftMax;
      const magnitude = Math.floor(rng() * maxDrift) + 1;
      const sign = rng() > 0.5 ? 1 : -1;
      return { playerId: p.id, delta: sign * magnitude };
    });

  return { headlineEvents, backgroundDrifts };
}
