/**
 * statusBadges — Unified badge emoji/label mapping for houseguest statuses.
 *
 * Badge code ↔ emoji mapping:
 *   'loh'       → 👑 / LOH badge asset  (Leader of the House)
 *   'pos'       → 🛡️ / POS badge asset  (Power of Safety holder)
 *   'veto_safe' → 🔰  (Safe for the rest of the cycle)
 *   'nominated' → ❓ / nomination badge asset  (Nominated for eviction)
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
  immune: '🛡️',
  loh: '👑',
  pos: '🛡️',
  veto_safe: '🔰',
  nominated: '❓',
  jury: '⚖️',
  first: '🥇',
  second: '🥈',
  third: '🥉',
};

const BADGE_ASSET_BASE = (import.meta.env.BASE_URL ?? '').replace(/\/$/, '');

export const STATUS_BADGE_IMAGE_SRC: Record<string, string> = {
  loh: `${BADGE_ASSET_BASE}/assets/avatar_badges/loh_badge.png`,
  pos: `${BADGE_ASSET_BASE}/assets/avatar_badges/safety_badge.svg`,
  nominated: `${BADGE_ASSET_BASE}/assets/avatar_badges/nomination_badge.png`,
};

/** Human-readable label for each badge code (used in aria-label). */
export const STATUS_BADGE_LABEL: Record<string, string> = {
  immune: 'Immune Today',
  loh: 'Leader of the House',
  pos: 'Power of Safety',
  veto_safe: 'Veto Safe',
  nominated: 'Nominated',
  jury: 'Tribunal Member',
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

export function statusBadgeImageSrc(status: string): string | undefined {
  return STATUS_BADGE_IMAGE_SRC[status];
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
  /** Short code used as a CSS modifier key, e.g. 'loh', 'pos'. */
  code: string;
  /** Emoji to display. */
  emoji: string;
  /** Optional image badge source, used when a status has a custom asset. */
  imageSrc?: string;
  /** Accessible label for screen readers. */
  label: string;
}

/**
 * Derive the ordered list of badges to show for a player given their status
 * string and optional final rank.
 *
 * Handles compound statuses like 'loh+pos' and 'nominated+pos' by splitting
 * on '+'. Final-rank medals take precedence and replace any existing status
 * badges so that only the medal is shown for finalists.
 *
 * @param status    - PlayerStatus string (e.g. 'loh', 'nominated+pos', 'active')
 * @param finalRank - Optional numeric final placement (1, 2, or 3)
 */
export function getBadgesForPlayer(
  status: string,
  finalRank?: number | null,
): BadgeInfo[] {
  const badges: BadgeInfo[] = [];

  // Split compound statuses (e.g. 'loh+pos' → ['loh','pos'])
  const parts = status ? status.split('+') : [];
  for (const part of parts) {
    const emoji = STATUS_BADGE_EMOJI[part];
    if (emoji) {
      badges.push({
        code: part,
        emoji,
        imageSrc: statusBadgeImageSrc(part),
        label: STATUS_BADGE_LABEL[part] ?? part,
      });
    }
  }

  // Append medal if a valid final rank (1–3) is set (overrides status badges for finals)
  if (finalRank === 1 || finalRank === 2 || finalRank === 3) {
    const rankCode = finalRankBadge(finalRank);
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
