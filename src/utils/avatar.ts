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
 * Resolves the initial avatar URL for a player.
 *
 * Returns the first of:
 *  1. player.avatar — if it is already a URL (starts with `http` or `/`)
 *  2. /avatars/{Name}.png — capitalised first letter, matching bbmobile's
 *     file-naming convention (e.g. Finn.png, Mimi.png)
 *
 * The caller is responsible for chaining fallbacks at render time:
 *  - First onError: swap src to getDicebear(player.name)
 *  - Second onError (Dicebear unreachable): show emoji / initials fallback
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
