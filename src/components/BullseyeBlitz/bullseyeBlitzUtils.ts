import type { Player } from '../../types';

export type TargetKind = 'standard' | 'bonus' | 'hazard';

interface TargetConfig {
  emoji: string;
  /** Base score delta when tapped. */
  points: number;
  /** Milliseconds the target lives before disappearing. */
  lifetimeMs: number;
  /** CSS class modifier. */
  cls: string;
  /** Tooltip / aria label. */
  label: string;
}

export const TARGET_CONFIGS: Record<TargetKind, TargetConfig> = {
  standard: {
    emoji: '🎯',
    points: 10,
    lifetimeMs: 2200,
    cls: 'bbl__target--standard',
    label: 'Standard target +10',
  },
  bonus: {
    emoji: '⭐',
    points: 25,
    lifetimeMs: 1300,
    cls: 'bbl__target--bonus',
    label: 'Bonus target +25',
  },
  hazard: {
    emoji: '💣',
    points: -15,
    lifetimeMs: 2800,
    cls: 'bbl__target--hazard',
    label: 'Hazard! −15 if tapped',
  },
};

/**
 * Select a random target kind using weighted distribution.
 *  standard:  60 %
 *  bonus:     25 %
 *  hazard:    15 %
 */
export function pickTargetKind(random01: number): TargetKind {
  if (random01 < 0.60) return 'standard';
  if (random01 < 0.85) return 'bonus';
  return 'hazard';
}

export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  hits: { standard: number; bonus: number; hazard: number };
  isHuman: boolean;
}

/**
 * Build a ranked leaderboard from raw scores + participant list.
 *
 * Tie-breaking rule (deterministic):
 *   Equal scores → lower participant index wins (earlier in the participants array).
 *   This is explicit and documented so it is never silently falling back to
 *   arbitrary order.
 */
export function buildRankedLeaderboard(
  participants: string[],
  scores: Record<string, number>,
  humanId: string | undefined,
  players: Player[],
  humanHits?: { standard: number; bonus: number; hazard: number },
): ScoreEntry[] {
  type RankedEntry = ScoreEntry & { participantIndex: number };

  const entries: RankedEntry[] = participants.map((id, idx) => {
    const p = players.find((pl) => pl.id === id);
    const isHuman = id === humanId;
    return {
      id,
      name: p?.name ?? id,
      score: scores[id] ?? 0,
      hits: isHuman && humanHits
        ? humanHits
        : { standard: 0, bonus: 0, hazard: 0 },
      isHuman,
      participantIndex: idx,
    };
  });

  const rankedEntries = entries.sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) return diff;
    return a.participantIndex - b.participantIndex;
  });

  return rankedEntries.map(({ participantIndex: _participantIndex, ...entry }) => entry);
}
