import {
  getBinaryFallbackKey,
  getGeolocationPermissionStatus,
  getPlatformLabel,
  resolveSkinAsset,
  SKIN_REGISTRY,
  type SkinAssetSource,
  type ThemeKey,
  type PlatformLabel,
} from './skinAssets';

/**
 * backgroundTheme.ts
 *
 * Resolves which background image to display based on:
 *   1. Holiday override  (Dec 20 – Jan 1)
 *   2. Geolocation + Open-Meteo current weather (no API key required)
 *   3. Time-of-day fallback
 *
 * The skin lookup itself is handled by src/utils/skinAssets.ts, which provides
 * a shared native-safe registry and a bundled asset URL resolver.
 */

const base = import.meta.env.BASE_URL ?? '/';
const normalizedBase = base.endsWith('/') ? base : `${base}/`;
export const ASSETS_BASE = `${normalizedBase}assets/skins/`;

export interface BackgroundEntry {
  file: string;
  label: string;
}

export const BACKGROUNDS: Record<ThemeKey, BackgroundEntry> = Object.fromEntries(
  Object.entries(SKIN_REGISTRY).map(([key, entry]) => [
    key,
    { file: entry.canonicalFile, label: entry.label },
  ]),
) as Record<ThemeKey, BackgroundEntry>;

export const CANDIDATES: Record<ThemeKey, string[]> = Object.fromEntries(
  Object.entries(SKIN_REGISTRY).map(([key, entry]) => [
    key,
    [entry.canonicalFile, ...(entry.aliases ?? [])],
  ]),
) as Record<ThemeKey, string[]>;

/**
 * Maps Open-Meteo WMO weathercode to a theme key.
 * https://open-meteo.com/en/docs#weathervariables
 */
export function mapWeatherCodeToTheme(weathercode: number): ThemeKey | null {
  if (weathercode === 0 || weathercode === 1) return null; // clear — fall through to time-of-day
  if (weathercode === 2 || weathercode === 3) return null; // partly/overcast — time-of-day
  if (weathercode >= 51 && weathercode <= 67) return 'rain'; // drizzle / rain
  if (weathercode >= 71 && weathercode <= 77) return 'snow'; // snow
  if (weathercode >= 80 && weathercode <= 82) return 'rain'; // showers
  if (weathercode >= 85 && weathercode <= 86) return 'snowday'; // snow showers
  if (weathercode >= 95 && weathercode <= 99) return 'thunderstorm'; // thunderstorm
  return null;
}

/**
 * Returns a time-of-day theme key based on the local hour.
 *   05–07  → sunrise
 *   08–17  → day
 *   18–20  → sunset
 *   21–04  → night
 */
export function timeOfDayKey(date: Date): ThemeKey {
  const hour = date.getHours();
  if (hour >= 5 && hour <= 7) return 'sunrise';
  if (hour >= 8 && hour <= 17) return 'day';
  if (hour >= 18 && hour <= 20) return 'sunset';
  return 'night';
}

export interface ResolvedTheme {
  key: ThemeKey;
  url: string;
  reason: string;
  assetFile: string;
  assetSource: SkinAssetSource;
  platform: PlatformLabel;
  permissionStatus: PermissionState | 'unsupported' | 'unknown';
}

export interface ResolveOptions {
  geolocationTimeoutMs?: number;
  forceNoGeo?: boolean;
}

/** Wraps navigator.geolocation.getCurrentPosition in a Promise with timeout. */
function getPosition(timeoutMs: number): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: timeoutMs,
      maximumAge: 10 * 60 * 1000, // accept cached position up to 10 min old
    });
  });
}

/** Queries Open-Meteo for current_weather at the given coordinates. */
async function fetchWeatherCode(lat: number, lon: number): Promise<number> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}&current_weather=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = (await res.json()) as { current_weather?: { weathercode?: number } };
  const code = data?.current_weather?.weathercode;
  if (typeof code !== 'number') throw new Error('No weathercode in response');
  return code;
}

/** Returns true when the current date falls in the Dec 20 – Jan 1 holiday window. */
function isHolidayWindow(date: Date): boolean {
  const month = date.getMonth() + 1; // 1-based
  const day = date.getDate();
  return (month === 12 && day >= 20) || (month === 1 && day === 1);
}

/** Picks the holiday sub-theme (Eve vs Day vs Night) within the window. */
function holidayKey(date: Date): ThemeKey {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();

  if (month === 12 && day === 24) return hour >= 18 ? 'xmasEve' : 'xmasDay';
  if (month === 12 && day === 25) return hour >= 18 ? 'xmasNight' : 'xmasDay';
  return hour >= 18 ? 'xmasNight' : 'xmasDay';
}

function logBackgroundResolution(details: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.info('[backgroundTheme] resolution', details);
  }
}

/**
 * Resolves the background theme to display.
 *
 * Resolution order:
 *   1. Holiday override (Dec 20 – Jan 1)
 *   2. Geolocation → Open-Meteo weather code → theme key
 *   3. Time-of-day fallback
 *
 * The selected theme key is resolved against the shared skin registry and,
 * if needed, falls back to the binary day/night background for the current
 * local time so the app never renders with an empty background.
 */
export async function resolveTheme(
  { geolocationTimeoutMs = 7000, forceNoGeo = false }: ResolveOptions = {},
): Promise<ResolvedTheme> {
  const now = new Date();
  const platform = getPlatformLabel();
  const permissionStatus = await getGeolocationPermissionStatus();
  const timeKey = timeOfDayKey(now);
  const binaryFallbackKey = getBinaryFallbackKey(now);

  let selectedKey: ThemeKey;
  let reason: string;
  let coordinates: { latitude: number; longitude: number } | null = null;
  let locationError: string | null = null;
  let weatherCode: number | null = null;
  let weatherKey: ThemeKey | null = null;

  // 1. Holiday override
  if (isHolidayWindow(now)) {
    selectedKey = holidayKey(now);
    reason = 'holiday';
  } else if (!forceNoGeo && typeof navigator !== 'undefined' && navigator.geolocation && permissionStatus !== 'denied') {
    // 2. Geolocation + weather
    try {
      const position = await getPosition(geolocationTimeoutMs);
      const { latitude, longitude } = position.coords;
      coordinates = { latitude, longitude };
      weatherCode = await fetchWeatherCode(latitude, longitude);
      weatherKey = mapWeatherCodeToTheme(weatherCode);

      if (weatherKey) {
        selectedKey = weatherKey;
        reason = `weather:${weatherCode}`;
      } else {
        // Clear/overcast: use the local time bucket.
        selectedKey = timeKey;
        reason = `weather:${weatherCode}:timeofday`;
      }
    } catch (err) {
      locationError = err instanceof Error ? err.message : String(err);
      selectedKey = binaryFallbackKey;
      reason = permissionStatus === 'denied' ? 'fallback:permission-denied' : 'fallback:location';
    }
  } else {
    // No usable location signal: fall back to a guaranteed day/night asset.
    locationError = forceNoGeo
      ? 'forceNoGeo'
      : permissionStatus === 'denied'
        ? 'permission denied'
        : 'geolocation unavailable';
    selectedKey = binaryFallbackKey;
    reason = 'fallback:location';
  }

  const resolvedAsset = resolveSkinAsset(selectedKey, binaryFallbackKey);
  const resolvedReason = resolvedAsset.key === selectedKey ? reason : `${reason}:asset-fallback:${resolvedAsset.key}`;

  logBackgroundResolution({
    platform,
    permissionStatus,
    coordinates,
    locationError,
    weatherCode,
    weatherKey,
    timeKey,
    binaryFallbackKey,
    selectedKey,
    resolvedKey: resolvedAsset.key,
    selectedAssetFile: resolvedAsset.file,
    selectedAssetSource: resolvedAsset.source,
    selectedAssetUrl: resolvedAsset.url,
    reason: resolvedReason,
  });

  return {
    key: resolvedAsset.key,
    url: resolvedAsset.url,
    reason: resolvedReason,
    assetFile: resolvedAsset.file,
    assetSource: resolvedAsset.source,
    platform,
    permissionStatus,
  };
}

export type { ThemeKey } from './skinAssets';
