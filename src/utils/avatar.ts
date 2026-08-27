// src/utils/avatar.ts
// Lightweight avatar resolver with Dicebear fallback.

import type { Player } from '../types';
import { getById, findByName } from '../data/houseguests';
import type { RemotePlayerOverride } from '../remoteConfig/remoteConfigTypes';
import {
  AVATAR_ASSET_FILES,
  FORMAL_CUTOUT_FILES,
  INFORMAL_CUTOUT_FILES,
} from '../data/avatarAssetManifest';

const PROFILE_PHOTO_AVATAR_PREFIX = 'profile-photo:';

export function profilePhotoAvatar(photoId: string): string {
  return `${PROFILE_PHOTO_AVATAR_PREFIX}${photoId}`;
}

export function getProfilePhotoAvatarId(avatar: string | null | undefined): string | null {
  if (!avatar?.startsWith(PROFILE_PHOTO_AVATAR_PREFIX)) return null;
  const id = avatar.slice(PROFILE_PHOTO_AVATAR_PREFIX.length);
  return id || null;
}

// ─── Remote override registry ────────────────────────────────────────────────

/**
 * Module-level map of houseguest id → remote avatar URL.
 * Populated at startup (via remoteConfigSlice) and consulted at resolve time.
 * This avoids threading Redux state through every avatar render site.
 */
let _remoteAvatarMap: Map<string, string> = new Map();

/**
 * Apply remote player avatar overrides from the remote config.
 * Called once after remoteConfigSlice loads the config.
 *
 * @param overrides - Array of RemotePlayerOverride entries from the remote config.
 */
export function setRemotePlayerOverrides(overrides: RemotePlayerOverride[]): void {
  _remoteAvatarMap = new Map(
    overrides
      .filter((o): o is RemotePlayerOverride & { avatarUrl: string } =>
        typeof o.avatarUrl === 'string' && o.avatarUrl.length > 0,
      )
      .map((o) => [o.id.toLowerCase(), o.avatarUrl]),
  );
}

/**
 * Returns true if the given string is a single emoji grapheme/sequence.
 * Used to decide whether to show emoji or initials as avatar fallback.
 * Matches a single Extended_Pictographic codepoint, optional variation selector,
 * and any ZWJ-joined extensions — but not arbitrary strings that merely contain an emoji.
 */
export function isEmoji(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  const singleEmojiRegex =
    /^\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*$/u;
  return singleEmojiRegex.test(trimmed);
}

/**
 * Returns a Dicebear avatar URL for the given seed string.
 * Uses the "pixel-art" style which renders a deterministic pixel-art face.
 */
export function getDicebear(seed: string): string {
  const encoded = encodeURIComponent(seed);
  return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encoded}`;
}

/** Guaranteed, base-aware fallback that never depends on a third-party service. */
export function getLocalAvatarFallback(name: string, isUser = false): string {
  if (isUser) return joinPublicAssetPath('assets/skins/You.png');
  const initials = (name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?').replace(/[&<>"']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#172033"/><circle cx="64" cy="64" r="48" fill="#263653"/><text x="64" y="76" text-anchor="middle" font-family="system-ui,sans-serif" font-size="38" font-weight="700" fill="#f5f7ff">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
 * Joins a filename under the assets/skins directory, prefixing the repo base when available.
 * When a non-root base is set, returns `{base}/assets/skins/{file}`.
 * Otherwise returns `assets/skins/{file}` (relative path, no leading slash).
 */
function joinAvatarPath(file: string): string {
  const base = getBase();
  if (base && base !== '/') {
    return `${base}/assets/skins/${file}`;
  }
  return `assets/skins/${file}`;
}

function joinPublicAssetPath(path: string): string {
  const base = getBase();
  if (base && base !== '/') {
    return `${base}/${path}`;
  }
  return path;
}

function normalizeExplicitAvatarPath(avatar: string | null | undefined): string | null {
  if (!avatar) return null;
  if (avatar.startsWith('http') || avatar.startsWith('/')) return avatar;

  const normalized = avatar.replace(/^\.\//, '');
  if (
    normalized.startsWith('assets/')
    || /\.(png|webp|svg|jpg|jpeg|wp2)$/i.test(normalized)
  ) {
    return joinPublicAssetPath(normalized);
  }

  return null;
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
 *       assets/skins/{HgId}_avatar.webp, assets/skins/{hgId}_avatar.webp
 *  3. Name-based candidates: assets/skins/CapitalizedName_avatar.webp,
 *       assets/skins/lowercasename_avatar.webp, assets/skins/{id}_avatar.webp
 *  4. Dicebear SVG fallback
 *
 * For numeric ids with no houseguest match, candidates are: assets/skins/{id}_avatar.webp
 */
export function resolveAvatarCandidates(player: Pick<Player, 'id' | 'name' | 'avatar'> & Partial<Pick<Player, 'isUser'>>): string[] {
  const candidates: string[] = [];

  if (getProfilePhotoAvatarId(player.avatar)) {
    candidates.push(getDicebear(player.name));
    return candidates;
  }

  if (player.avatar && (player.avatar.startsWith('data:') || player.avatar.startsWith('blob:'))) {
    candidates.push(player.avatar);
    return candidates;
  }

  const isUserPlayer = player.isUser === true || player.id === 'user';
  const lookupTokens = collectAssetLookupTokens(player);

  // Synthetic/season-generated contestants intentionally carry a complete
  // remote or bundled portrait URL. They have no canonical cast identity, so
  // honour that portrait before speculative name-based files (which otherwise
  // fail through to initials on mobile).
  const canonicalPlayer = isUserPlayer ? undefined : (getById(player.id) ?? findByName(player.name));
  const explicitAvatarPath = normalizeExplicitAvatarPath(player.avatar);
  const isCombinedTwinPortrait = /Ali_lia_avatar\.(?:webp|svg)(?:$|[?#])/i.test(explicitAvatarPath ?? '');
  if ((!canonicalPlayer || isCombinedTwinPortrait) && explicitAvatarPath) {
    candidates.push(explicitAvatarPath);
  }

  // Remote config override takes highest priority (if provided for this player id).
  const hgForRemote = canonicalPlayer;
  const remoteAvatarUrl = hgForRemote ? _remoteAvatarMap.get(hgForRemote.id) : undefined;
  if (remoteAvatarUrl) {
    candidates.push(remoteAvatarUrl);
  }

  // A custom player has no canonical houseguest artwork. Avoid speculative
  // name/id requests that produce a broken image before the bundled player
  // fallback is shown. An explicit custom avatar still remains first.
  if (isUserPlayer) {
    const explicitAvatarPath = normalizeExplicitAvatarPath(player.avatar);
    if (explicitAvatarPath) {
      candidates.push(explicitAvatarPath);
    }
    candidates.push(getLocalAvatarFallback(player.name, true));
    return candidates;
  }

  const folderAvatar = listAvatarAssetCandidates().find(({ basename }) => {
    const token = normalizeNameToken(basename.replace(/_avatar$/i, ''));
    return lookupTokens.includes(token);
  });
  if (folderAvatar) {
    candidates.push(folderAvatar.source);
  }

  const id = player.id;
  const isNumeric = /^\d+$/.test(id);

  // Try to resolve a stable houseguest id from the canonical dataset.
  // Match by player.id first (in case it is already a slug), then by player.name.
  const hg = canonicalPlayer;
  if (hg) {
    const hgId = hg.id; // lowercase stable slug, e.g. 'finn'
    const hgIdCap = capitalize(hgId); // e.g. 'Finn'
    candidates.push(
      joinAvatarPath(`${hgIdCap}_avatar.webp`),
      joinAvatarPath(`${hgId}_avatar.webp`),
    );
  }

  if (isNumeric) {
    candidates.push(joinAvatarPath(`${id}_avatar.webp`));
  } else {
    const cap = capitalize(player.name);
    const lower = player.name.toLowerCase();
    candidates.push(
      joinAvatarPath(`${cap}_avatar.webp`),
      joinAvatarPath(`${lower}_avatar.webp`),
      joinAvatarPath(`${id}_avatar.webp`),
    );
  }

  // Canonical houseguest identity wins over a stale serialized avatar path.
  // Older saved games can retain a previous player's filename here; resolving
  // by the stable id/name first prevents labels such as Kai/Ivy or Zed/Vee
  // from ever being paired with the wrong portrait.
  if (explicitAvatarPath && !candidates.includes(explicitAvatarPath)) {
    candidates.push(explicitAvatarPath);
  }

  candidates.push(getDicebear(player.name), getLocalAvatarFallback(player.name, isUserPlayer));

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
 * app's base (e.g. /bbmobilenew/assets/skins/Finn_avatar.webp on GitHub Pages).
 *
 * The caller is responsible for chaining fallbacks at render time:
 *  - First onError: swap src to getDicebear(player.name)
 *  - Second onError (Dicebear unreachable): show emoji / initials fallback
 */
export function resolveAvatar(player: Pick<Player, 'id' | 'name' | 'avatar'> & Partial<Pick<Player, 'isUser'>>): string {
  const candidates = resolveAvatarCandidates(player);
  if (typeof window !== 'undefined' && (window as Window & { __AVATAR_DEBUG?: boolean }).__AVATAR_DEBUG) {
    console.debug('[avatar] resolveAvatar candidates for', player.name, candidates);
  }
  return candidates[0];
}

/**
 * Maps canonical houseguest ids to their historical formal-cutout stems.
 * These are used as a fallback if the folder scan does not find a direct match.
 */
const FORMAL_CUTOUT_MAP: Record<string, string> = {
  ivy: 'Ivy_formal',
  jax: 'Jax_formal',
  kai: 'Kai_formal',
  kian: 'Kian_formal',
  lia: 'Lia_formal',
  lux: 'Lux_formal',
  mimi: 'Mimi_formal',
  nico: 'Nico_formal',
  noa: 'Noa_formal',
  nova: 'Nova_formal',
  pax: 'Pax_formal',
  quinn: 'Quinn_formal',
  rae: 'Rae_formal',
  remy: 'Remy_formal',
  rune: 'Rune_formal',
  vee: 'Vee_formal',
  zed: 'Zed_formal',
};

function normalizeNameToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isTwinShockAliIdentity(player: Pick<Player, 'id' | 'name'>): boolean {
  return normalizeNameToken(player.id) === 'ali' || normalizeNameToken(player.name) === 'ali';
}

function collectAssetLookupTokens(player: Pick<Player, 'id' | 'name'>): string[] {
  const hg = getById(player.id) ?? findByName(player.name);

  return [hg?.id, hg?.name, player.id, player.name]
    .filter((value): value is string => Boolean(value))
    .map(normalizeNameToken);
}

function collectTwinShockFullSizeLookupTokens(player: Pick<Player, 'id' | 'name'>): string[] {
  const baseTokens = collectAssetLookupTokens(player);
  if (!isTwinShockAliIdentity(player)) return baseTokens;

  const lia = getById('lia') ?? findByName('Lia');
  const aliasTokens = [lia?.id, lia?.name, 'lia', 'Lia']
    .filter((value): value is string => Boolean(value))
    .map(normalizeNameToken);

  return [...new Set([...baseTokens, ...aliasTokens])];
}

function listFormalCutoutCandidates(): Array<{ basename: string; filename: string }> {
  return FORMAL_CUTOUT_FILES
    .map((filename) => {
      const basename = filename.replace(/\.[^.]+$/, '');
      return { basename, filename };
    })
    .sort((a, b) => {
      const formatPriority = (filename: string) => (
        filename.toLowerCase().endsWith('.png') ? 0 : 1
      );
      return formatPriority(a.filename) - formatPriority(b.filename);
    });
}

function listInformalCutoutCandidates(): Array<{ basename: string; filename: string }> {
  return INFORMAL_CUTOUT_FILES.map((filename) => {
    const basename = filename.replace(/\.[^.]+$/, '');
    return { basename, filename };
  });
}

function listAvatarAssetCandidates(): Array<{ basename: string; source: string }> {
  return AVATAR_ASSET_FILES.map((filename) => {
    const basename = filename.replace(/\.[^.]+$/, '');
    return { basename, source: joinPublicAssetPath(`assets/skins/${filename}`) };
  });
}

function resolveFormalCutoutFromFolder(player: Pick<Player, 'id' | 'name'>): string | null {
  const targetTokens = collectTwinShockFullSizeLookupTokens(player);
  if (targetTokens.length === 0) return null;

  const candidates = listFormalCutoutCandidates();

  const exactMatch = candidates.find(({ basename }) => {
    const token = normalizeNameToken(basename.replace(/_formal.*$/i, ''));
    return targetTokens.includes(token);
  });
  if (exactMatch) {
    return joinPublicAssetPath(`assets/formal_attires/${exactMatch.filename}`);
  }

  const fuzzyMatch = candidates.find(({ basename }) => {
    const token = normalizeNameToken(basename);
    return targetTokens.some((target) => token.includes(target) || target.includes(token));
  });
  if (fuzzyMatch) {
    return joinPublicAssetPath(`assets/formal_attires/${fuzzyMatch.filename}`);
  }

  return null;
}

/**
 * Returns the URL for a housemate's full-body formal cutout from
 * `public/assets/formal_attires/`, or `null` when no cutout exists for this player.
 */
export function resolveFormalCutout(player: Pick<Player, 'id' | 'name'>): string | null {
  const folderMatch = resolveFormalCutoutFromFolder(player);
  if (folderMatch) {
    return folderMatch;
  }

  const aliasPlayer = isTwinShockAliIdentity(player)
    ? ({ id: 'lia', name: 'Lia' } as const)
    : player;
  const hg = getById(aliasPlayer.id) ?? findByName(aliasPlayer.name);
  if (!hg) return null;
  const stem = FORMAL_CUTOUT_MAP[hg.id];
  if (!stem) return null;
  const base = getBase();
  if (base && base !== '/') {
    return `${base}/assets/formal_attires/${stem}.png`;
  }
  return `assets/formal_attires/${stem}.png`;
}

/**
 * Maps canonical houseguest ids to their full-body transparent cutout filename stems
 * located in `public/assets/Informal_attires/`.
 */
const INFORMAL_CUTOUT_MAP: Record<string, string> = {
  aria: 'Aria_informal',
  ash: 'Ash_informal',
  bea: 'Bea_informal',
  blue: 'Blue_informal',
  echo: 'echo_informal',
  finn: 'Finn_informal',
  ivy: 'Ivy_informal',
  jax: 'Jax_informal',
  kai: 'Kai_informal',
  kian: 'Kian_informal2',
  lia: 'Lia_informal',
  lux: 'Lux_informal',
  mimi: 'Mimi_informal',
  noa: 'Noa_informal',
  nova: 'Nova_informal',
  pax: 'Pax_informal',
  quinn: 'Quinn_informal',
  rae: 'Rae_informal',
  remy: 'Remy_informal',
  rey: 'Rey_informal',
  rune: 'Rune_informal',
  sol: 'Sol_informal',
  vee: 'Vee_informal',
  zed: 'Zed_informal',
};

const FEMALE_AVATAR_EMOJI = '👩';
const MALE_AVATAR_EMOJI = '👨';

/**
 * Returns the URL for a housemate's full-body transparent cutout from
 * `public/assets/Informal_attires/`, or `null` when no cutout exists for this player.
 *
 * Usage in a component:
 *   const cutoutSrc = resolveInformalCutout(player) ?? resolveAvatar(player);
 */
export function resolveInformalCutout(player: Pick<Player, 'id' | 'name'>): string | null {
  const targetTokens = collectTwinShockFullSizeLookupTokens(player);
  if (targetTokens.length === 0) return null;

  const folderMatch = listInformalCutoutCandidates().find(({ basename }) => {
    const token = normalizeNameToken(basename.replace(/_informal.*$/i, ''));
    return targetTokens.includes(token);
  });
  if (folderMatch) {
    return joinPublicAssetPath(`assets/Informal_attires/${folderMatch.filename}`);
  }

  const aliasPlayer = isTwinShockAliIdentity(player)
    ? ({ id: 'lia', name: 'Lia' } as const)
    : player;
  const hg = getById(aliasPlayer.id) ?? findByName(aliasPlayer.name);
  const stem = hg ? INFORMAL_CUTOUT_MAP[hg.id] : null;
  if (!stem) return null;
  return joinPublicAssetPath(`assets/Informal_attires/${stem}.png`);
}

export function resolveSilhouetteFallback(
  player?: Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'avatar'>>,
): string {
  if (!player) {
    return joinPublicAssetPath('assets/silhouette_male - Copy.webp');
  }
  const hg = getById(player.id) ?? findByName(player.name);
  const isFemale = hg?.sex?.toLowerCase() === 'female' || player.avatar === '👩';
  const file = isFemale ? 'silhouette_female - Copy.webp' : 'silhouette_male - Copy.webp';
  return joinPublicAssetPath(`assets/${file}`);
}

type FullSizeCutoutFallbackPlayer = Pick<Player, 'id' | 'name'> & Partial<Pick<Player, 'avatar'>> & {
  gender?: string;
  sex?: string;
};

export function resolveFullSizeCutoutFallback(player: FullSizeCutoutFallbackPlayer): string {
  const hg = getById(player.id) ?? findByName(player.name);
  const rawGender = (player.gender ?? player.sex ?? hg?.sex ?? '').toLowerCase().trim();

  if (rawGender.includes('female') || rawGender.includes('woman')) {
    return joinPublicAssetPath('assets/full_body_fallback_female.png');
  }

  if (rawGender.includes('male') || rawGender.includes('man')) {
    return joinPublicAssetPath('assets/full_body_fallback_male.png');
  }

  // If any explicit gender/sex is provided (including non-binary / prefer-not-to-say / unknown),
  // do not override it by inferring from avatar emoji.
  if (rawGender.length > 0) {
    return joinPublicAssetPath('assets/full_body_fallback_neutral.png');
  }

  if (player.avatar === FEMALE_AVATAR_EMOJI) {
    return joinPublicAssetPath('assets/full_body_fallback_female.png');
  }

  if (player.avatar === MALE_AVATAR_EMOJI) {
    return joinPublicAssetPath('assets/full_body_fallback_male.png');
  }

  return joinPublicAssetPath('assets/full_body_fallback_neutral.png');
}

export function resolveInformalCutoutCandidates(
  player: FullSizeCutoutFallbackPlayer,
): string[] {
  const cutout = resolveInformalCutout(player);
  const fullSizeFallback = resolveFullSizeCutoutFallback(player);
  return [cutout, fullSizeFallback].filter(
    (candidate, index, all): candidate is string =>
      Boolean(candidate) && all.indexOf(candidate) === index,
  );
}
