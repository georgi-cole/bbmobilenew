import type { Phase } from '../types';

const STORAGE_KEY = 'bb_eviction_vote_breakdown_v1';

export type EvictionVoteBreakdownStatus = 'available' | 'revealed' | 'declined';

export interface EvictionVoteBreakdownUnlock {
  week: number;
  phase: Phase;
  votes: Record<string, string>;
  nomineeIds: string[];
  evicteeId: string | null;
  status: EvictionVoteBreakdownStatus;
}

export function loadEvictionVoteBreakdownUnlock(): EvictionVoteBreakdownUnlock | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EvictionVoteBreakdownUnlock) : null;
  } catch {
    return null;
  }
}

export function saveEvictionVoteBreakdownUnlock(unlock: EvictionVoteBreakdownUnlock): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(unlock));
  } catch {
    // Ignore storage failures in unsupported/private contexts.
  }
}

export function isEvictionVoteBreakdownActive(
  unlock: EvictionVoteBreakdownUnlock | null,
  week: number,
  _phase: Phase,
): unlock is EvictionVoteBreakdownUnlock {
  // Match on week only — the confessional reveal remains accessible throughout
  // the current week regardless of which phase the player visits the Diary Room
  // in (e.g. week_end or week_start after the eviction animation completes).
  return Boolean(unlock && unlock.week === week);
}

export function updateEvictionVoteBreakdownStatus(
  status: EvictionVoteBreakdownStatus,
): EvictionVoteBreakdownUnlock | null {
  const current = loadEvictionVoteBreakdownUnlock();
  if (!current) return null;
  const next = { ...current, status };
  saveEvictionVoteBreakdownUnlock(next);
  return next;
}
