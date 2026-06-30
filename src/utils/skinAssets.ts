import { Capacitor } from '@capacitor/core';
import skinRegistry from '../data/skinRegistry.json';

export type ThemeKey =
  | 'sunrise'
  | 'day'
  | 'sunset'
  | 'night'
  | 'rain'
  | 'snow'
  | 'snowday'
  | 'thunderstorm'
  | 'xmasDay'
  | 'xmasEve'
  | 'xmasNight';

export type PlatformLabel = 'web' | 'ios' | 'android';
export type SkinAssetSource = 'bundled' | 'public';
export type GeolocationPermissionStatus = PermissionState | 'denied' | 'unsupported' | 'unknown';

export interface SkinRegistryEntry {
  label: string;
  canonicalFile: string;
  aliases?: string[];
}

export type SkinRegistry = Record<ThemeKey, SkinRegistryEntry>;

export interface SkinAssetResolution {
  key: ThemeKey;
  label: string;
  file: string;
  url: string;
  source: SkinAssetSource;
  candidates: string[];
}

export const SKIN_REGISTRY = skinRegistry as SkinRegistry;

const SKIN_ASSET_MODULES = import.meta.glob(
  '../../public/assets/skins/*.{png,jpg,jpeg,webp,avif,gif,svg,wp2}',
  {
    eager: true,
    import: 'default',
  },
) as Record<string, string>;

const SKIN_URL_BY_FILENAME = new Map<string, string>(
  Object.entries(SKIN_ASSET_MODULES).map(([assetPath, url]) => [
    assetPath.split('/').pop() ?? assetPath,
    url,
  ]),
);

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
}

function getRegistryEntry(key: ThemeKey): SkinRegistryEntry {
  return SKIN_REGISTRY[key];
}

function buildPublicSkinUrl(filename: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}assets/skins/${filename}`;
}

export function resolveSkinAssetPath(filename: string): string {
  return SKIN_URL_BY_FILENAME.get(filename) ?? buildPublicSkinUrl(filename);
}

function resolveSkinAssetWithoutFallback(key: ThemeKey): SkinAssetResolution | null {
  const entry = getRegistryEntry(key);
  const candidates = unique([entry.canonicalFile, ...(entry.aliases ?? [])]);

  for (const file of candidates) {
    const url = SKIN_URL_BY_FILENAME.get(file) ?? null;
    if (url) {
      return {
        key,
        label: entry.label,
        file,
        url,
        source: 'bundled',
        candidates,
      };
    }
  }

  return null;
}

export function getSkinCandidates(key: ThemeKey): string[] {
  const entry = getRegistryEntry(key);
  return unique([entry.canonicalFile, ...(entry.aliases ?? [])]);
}

export function resolveSkinAsset(key: ThemeKey, fallbackKey?: ThemeKey): SkinAssetResolution {
  const primary = resolveSkinAssetWithoutFallback(key);
  if (primary) {
    return primary;
  }

  if (fallbackKey && fallbackKey !== key) {
    const fallback = resolveSkinAssetWithoutFallback(fallbackKey);
    if (fallback) {
      return fallback;
    }
  }

  const entry = getRegistryEntry(fallbackKey ?? key);
  const candidates = unique([entry.canonicalFile, ...(entry.aliases ?? [])]);
  const file = candidates[0] ?? `${fallbackKey ?? key}.png`;

  return {
    key: fallbackKey ?? key,
    label: entry.label,
    file,
    url: resolveSkinAssetPath(file),
    source: SKIN_URL_BY_FILENAME.has(file) ? 'bundled' : 'public',
    candidates,
  };
}

export function getPlatformLabel(): PlatformLabel {
  if (Capacitor.isNativePlatform()) {
    const platform = Capacitor.getPlatform();
    return platform === 'ios' || platform === 'android' ? platform : 'web';
  }

  return 'web';
}

export async function getGeolocationPermissionStatus(): Promise<GeolocationPermissionStatus> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unsupported';
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state as GeolocationPermissionStatus;
  } catch {
    return 'unknown';
  }
}

export function getBinaryFallbackKey(date: Date): Extract<ThemeKey, 'day' | 'night'> {
  const hour = date.getHours();
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}
