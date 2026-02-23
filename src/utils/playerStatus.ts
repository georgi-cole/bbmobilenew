/**
 * Centralized player-status detection utilities for the Social module.
 *
 * Keeping these checks in one place means status-key changes only need to be
 * updated here rather than scattered across components and the action executor.
 */

import type { Player } from '../types';

/**
 * Returns true for any player who has been physically removed from the active
 * game, including:
 *  - Pre-jury evictees (status === 'evicted') – went home.
 *  - Jury-house members (status === 'jury')  – evicted after jury started.
 *
 * Use this to guard the action executor and disable interaction in the Social
 * module so neither group can be targeted.
 */
export function isEvicted(player: Pick<Player, 'status'>): boolean {
  return player.status === 'evicted' || player.status === 'jury';
}

/**
 * Returns true for players who were evicted before jury started and therefore
 * never made it to the jury house (status === 'evicted').
 *
 * Non-jury players are removed entirely from the Social module roster.
 */
export function isNonJury(player: Pick<Player, 'status'>): boolean {
  return player.status === 'evicted';
}
