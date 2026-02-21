// src/utils/avatar.ts
// Lightweight avatar resolver with Dicebear fallback.

import type { Player } from '../types';

/**
 * Returns a Dicebear avatar URL for the given seed string.
 * Uses the "pixel-art" style which renders a deterministic pixel-art face.
 */
export function getDicebear(seed: string): string {
  const encoded = encodeURIComponent(seed);
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encoded}`;
}

/**
 * Resolves the best available avatar URL for a player.
 *
 * Priority order:
 *  1. player.avatar (if it looks like a URL, not an emoji)
 *  2. /avatars/{Name}.png  (capitalised, matching bbmobile naming)
 *  3. /avatars/{name}.png  (lowercase)
 *  4. /avatars/{id}.png    (stable id)
 *  5. Dicebear fallback
 *
 * The returned URL is used as the initial <img> src.
 * An onError handler should call getDicebear(player.name) to swap in the
 * Dicebear URL and set onerror=null to prevent infinite retry loops.
 */
export function resolveAvatar(player: Pick<Player, 'id' | 'name' | 'avatar'>): string {
  // If player.avatar is already a URL (starts with http/https or /), use it
  if (player.avatar && (player.avatar.startsWith('http') || player.avatar.startsWith('/'))) {
    return player.avatar;
  }
  // Try capitalised filename first (matches bbmobile convention: Name.png)
  const cap = player.name.charAt(0).toUpperCase() + player.name.slice(1).toLowerCase();
  return `/avatars/${cap}.png`;
}
