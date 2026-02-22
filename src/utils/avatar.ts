// src/utils/avatar.ts
// Lightweight avatar resolver with Dicebear fallback.

import type { Player } from '../types';
import { getById, findByName } from '../data/houseguests';

/**
 * Returns a Dicebear avatar URL for the given seed string.
 * Uses the "pixel-art" style which renders a deterministic pixel-art face.
 */
export function getDicebear(seed: string): string {
  const encoded = encodeURIComponent(seed);
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encoded}`;
}

/**
 * Returns the base path prefix for avatar URLs.
 * Priority: window.AVATAR_BASE_PATH > process.env.PUBLIC_URL > import.meta.env.BASE_URL
 * Trailing slash is stripped from the result.
 */
function getBase(): string {
  if (typeof window !== 'undefined' && (window as Window & { AVATAR_BASE_PATH?: string }).AVATAR_BASE_PATH) {
    return (window as Window & { AVATAR_BASE_PATH?: string }).AVATAR_BASE_PATH!.replace(/\/$/, '');
  }
  // process.env.PUBLIC_URL is available in CRA-style builds; access via
  // globalThis to avoid TypeScript errors in browser-targeted tsconfig
  const proc = (globalThis as { process?: { env?: { PUBLIC_URL?: string } } }).process;
  if (proc?.env?.PUBLIC_URL) {
    return proc.env.PUBLIC_URL.replace(/\/$/, '');
  }
  // Vite injects BASE_URL from vite.config.ts `base` option (e.g. '/bbmobilenew/')
  const base: string = import.meta.env.BASE_URL ?? '';
  return base.replace(/\/$/, '');
}

/**
 * Joins a filename under the avatars directory, prefixing the repo base when available.
 * When a non-root base is set, returns `{base}/avatars/{file}`.
 * Otherwise returns `avatars/{file}` (relative path, no leading slash).
 */
function joinAvatarPath(file: string): string {
  const base = getBase();
  if (base && base !== '/') {
    return `${base}/avatars/${file}`;
  }
  return `avatars/${file}`;
}

/** Capitalises the first letter of a string and lowercases the rest. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Returns all candidate avatar URLs for a player, from most to least preferred.
 * The final entry is always a Dicebear fallback URL.
 *
 * Resolution order:
 *  1. player.avatar if already a full URL or absolute path
 *  2. Stable houseguest id candidates (matched by player.id then player.name):
 *       avatars/{hgId}.png, avatars/{HgId}.png, avatars/{hgId}.jpg, avatars/{HgId}.jpg
 *  3. Name-based candidates: avatars/CapitalizedName.png, avatars/lowercasename.png,
 *       avatars/{id}.png, avatars/{id}.jpg, avatars/CapitalizedName.jpg, avatars/lowercasename.jpg
 *  4. Dicebear SVG fallback
 *
 * For numeric ids with no houseguest match, candidates are: avatars/{id}.png, avatars/{id}.jpg
 */
export function resolveAvatarCandidates(player: Pick<Player, 'id' | 'name' | 'avatar'>): string[] {
  const candidates: string[] = [];

  // If player.avatar is already a full URL or absolute path, use it first
  if (player.avatar && (player.avatar.startsWith('http') || player.avatar.startsWith('/'))) {
    candidates.push(player.avatar);
  }

  const id = player.id;
  const isNumeric = /^\d+$/.test(id);

  // Try to resolve a stable houseguest id from the canonical dataset.
  // Match by player.id first (in case it is already a slug), then by player.name.
  const hg = getById(id) ?? findByName(player.name);
  if (hg) {
    const hgId = hg.id; // lowercase stable slug, e.g. 'finn'
    const hgIdCap = capitalize(hgId); // e.g. 'Finn'
    candidates.push(
      joinAvatarPath(`${hgId}.png`),
      joinAvatarPath(`${hgIdCap}.png`),
      joinAvatarPath(`${hgId}.jpg`),
      joinAvatarPath(`${hgIdCap}.jpg`),
    );
  }

  if (isNumeric) {
    candidates.push(joinAvatarPath(`${id}.png`), joinAvatarPath(`${id}.jpg`));
  } else {
    const cap = capitalize(player.name);
    const lower = player.name.toLowerCase();
    candidates.push(
      joinAvatarPath(`${cap}.png`),
      joinAvatarPath(`${lower}.png`),
      joinAvatarPath(`${id}.png`),
      joinAvatarPath(`${id}.jpg`),
      joinAvatarPath(`${cap}.jpg`),
      joinAvatarPath(`${lower}.jpg`),
    );
  }

  candidates.push(getDicebear(player.name));

  return candidates;
}

/**
 * Debug helper: returns all candidate URLs for a player.
 * Useful in the browser console: `window.__bb.getAvatarCandidatesFor(player)`
 * Enable verbose logging by setting `window.__AVATAR_DEBUG = true`.
 */
export const getAvatarCandidatesFor = resolveAvatarCandidates;

/**
 * Resolves the initial avatar URL for a player.
 *
 * Returns the first candidate from resolveAvatarCandidates() so the
 * initial <img src> points to a path that resolves correctly under the
 * app's base (e.g. /bbmobilenew/avatars/Finn.png on GitHub Pages).
 *
 * The caller is responsible for chaining fallbacks at render time:
 *  - First onError: swap src to getDicebear(player.name)
 *  - Second onError (Dicebear unreachable): show emoji / initials fallback
 */
export function resolveAvatar(player: Pick<Player, 'id' | 'name' | 'avatar'>): string {
  const candidates = resolveAvatarCandidates(player);
  if (typeof window !== 'undefined' && (window as Window & { __AVATAR_DEBUG?: boolean }).__AVATAR_DEBUG) {
    console.debug('[avatar] resolveAvatar candidates for', player.name, candidates);
  }
  return candidates[0];
}
