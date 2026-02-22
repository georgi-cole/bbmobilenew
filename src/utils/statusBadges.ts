/**
 * statusBadges — Unified badge emoji/label mapping for houseguest statuses.
 *
 * Badge code ↔ emoji mapping:
 *   'hoh'       → 👑  (Head of Household)
 *   'pov'       → 🛡️  (Power of Veto holder)
 *   'nominated' → ❓  (Nominated for eviction)
 *   'jury'      → ⚖️  (Jury member)
 *   'evicted'   → (no badge — evictee X overlay used instead)
 *   'first'     → 🥇  (1st place / winner)
 *   'second'    → 🥈  (2nd place / runner-up)
 *   'third'     → 🥉  (3rd place)
 *
 * Usage:
 *   import { statusBadgeEmoji, finalRankBadge, getBadgesForPlayer } from '../utils/statusBadges';
 */

/** Map of single-status codes to their badge emoji. */
export const STATUS_BADGE_EMOJI: Record<string, string> = {
  hoh: '👑',
  pov: '🛡️',
  nominated: '❓',
  jury: '⚖️',
  first: '🥇',
  second: '🥈',
  third: '🥉',
};

/** Human-readable label for each badge code (used in aria-label). */
export const STATUS_BADGE_LABEL: Record<string, string> = {
  hoh: 'Head of Household',
  pov: 'Power of Veto',
  nominated: 'Nominated',
  jury: 'Juror',
  first: '1st place',
  second: '2nd place',
  third: '3rd place',
};

/**
 * Return the emoji for a single status code, or undefined if no badge exists.
 */
export function statusBadgeEmoji(status: string): string | undefined {
  return STATUS_BADGE_EMOJI[status];
}

/**
 * Map a numeric final rank (1 | 2 | 3) to the corresponding medal badge code.
 * Returns undefined for ranks outside 1–3.
 */
export function finalRankBadge(rank: 1 | 2 | 3): string | undefined {
  if (rank === 1) return 'first';
  if (rank === 2) return 'second';
  if (rank === 3) return 'third';
  return undefined;
}

export interface BadgeInfo {
  /** Short code used as a CSS modifier key, e.g. 'hoh', 'pov'. */
  code: string;
  /** Emoji to display. */
  emoji: string;
  /** Accessible label for screen readers. */
  label: string;
}

/**
 * Derive the ordered list of badges to show for a player given their status
 * string and optional final rank.
 *
 * Handles compound statuses like 'hoh+pov' and 'nominated+pov' by splitting
 * on '+'.  Final-rank medals take precedence and are appended last.
 *
 * @param status    - PlayerStatus string (e.g. 'hoh', 'nominated+pov', 'active')
 * @param finalRank - Optional numeric final placement (1, 2, or 3)
 */
export function getBadgesForPlayer(
  status: string,
  finalRank?: number | null,
): BadgeInfo[] {
  const badges: BadgeInfo[] = [];

  // Split compound statuses (e.g. 'hoh+pov' → ['hoh','pov'])
  const parts = status ? status.split('+') : [];
  for (const part of parts) {
    const emoji = STATUS_BADGE_EMOJI[part];
    if (emoji) {
      badges.push({ code: part, emoji, label: STATUS_BADGE_LABEL[part] ?? part });
    }
  }

  // Append medal if a final rank is set (overrides status badges for finals)
  if (finalRank != null) {
    const rankCode = finalRankBadge(finalRank as 1 | 2 | 3);
    if (rankCode) {
      // Remove any status badges and show only the medal for finalists
      badges.length = 0;
      badges.push({
        code: rankCode,
        emoji: STATUS_BADGE_EMOJI[rankCode]!,
        label: STATUS_BADGE_LABEL[rankCode]!,
      });
    }
  }

  return badges;
}
