// src/utils/houseguestLookup.ts
// Merges static houseguest profile data with live Player state.

import type { Player } from '../types';
import type { EnrichedPlayer } from '../types/houseguest';
import { getById, findByName } from '../data/houseguests';

export { getById as findById, findByName };

/**
 * Merges a live Player with static profile fields from the houseguests dataset.
 * Returns an EnrichedPlayer that has all live state plus any static fields found.
 */
export function enrichPlayer(player: Player): EnrichedPlayer {
  const profile = getById(player.id) ?? findByName(player.name);
  return {
    ...player,
    fullName: profile?.fullName,
    age: profile?.age,
    sex: profile?.sex,
    location: profile?.location,
    profession: profile?.profession,
    motto: profile?.motto,
    funFact: profile?.funFact,
    story: profile?.story,
    allies: profile?.allies,
    enemies: profile?.enemies,
  };
}
