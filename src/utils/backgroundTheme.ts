/**
 * backgroundTheme.ts
 *
 * Resolves which background image to display based on:
 *   1. Holiday override  (Dec 20 – Jan 1)
 *   2. Geolocation + Open-Meteo current weather (no API key required)
 *   3. Time-of-day fallback
 *
 * Asset resolution order for each chosen theme key:
 *   a. Fetch public/assets/skins/skins.json manifest → use mapped filename if
 *      the file exists (HEAD check).
 *   b. Probe candidate filename lists with HEAD requests; pick first hit.
 *   c. Fall back to DEFAULT_FILE.
 */

const VITE_BASE: string = import.meta.env.BASE_URL ?? '/';
export const ASSETS_BASE = `${VITE_BASE.replace(/\/$/, '')}/assets/skins/`;

/** Ultimate fallback filename when no candidate can be found. */
const DEFAULT_FILE = 'daily-background.png';

export interface BackgroundEntry {
  file: string;
  label: string;
}

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

export const BACKGROUNDS: Record<ThemeKey, BackgroundEntry> = {
  sunrise:      { file: 'bg-sunrise.png',      label: 'Sunrise'      },
  day:          { file: 'bg-day.png',           label: 'Daytime'      },
  sunset:       { file: 'bg-sunset.png',        label: 'Sunset'       },
  night:        { file: 'bg-night.png',         label: 'Night'        },
  rain:         { file: 'bg-rain.png',          label: 'Rainy'        },
  snow:         { file: 'bg-snow.png',          label: 'Snow'         },
  snowday:      { file: 'bg-snowday.png',       label: 'Snowy Day'    },
  thunderstorm: { file: 'bg-thunderstorm.png',  label: 'Thunderstorm' },
  xmasDay:      { file: 'bg-xmas-day.png',      label: 'Christmas Day'   },
  xmasEve:      { file: 'bg-xmas-eve.png',      label: 'Christmas Eve'   },
  xmasNight:    { file: 'bg-xmas-night.png',    label: 'Christmas Night' },
};

/**
 * Candidate filenames to probe (HEAD) when no manifest is available.
 * Listed in priority order; first existing file wins.
 * NOTE: Keep in sync with the filenames emitted by scripts/generate-skins-manifest.mjs
 * so that the fallback probing covers any files the manifest generator would detect.
 */
export const CANDIDATES: Record<ThemeKey, string[]> = {
  sunrise:      ['bg-sunrise.png',      'sunrise-background.png'                              ],
  day:          ['bg-day.png',          'daily-background.png',    'autumn-leaves-background.png'],
  sunset:       ['bg-sunset.png',       'sunset-background.png'                               ],
  night:        ['bg-night.png',        'icy-night-background.jpg', 'night-snow-background.png'],
  rain:         ['bg-rain.png',         'rainy-background.png'                                ],
  snow:         ['bg-snow.png',         'blizzard-background.png'                             ],
  snowday:      ['bg-snowday.png',      'snowday-background.png'                              ],
  thunderstorm: ['bg-thunderstorm.png', 'thunderstorm-background.png'                         ],
  xmasDay:      ['bg-xmas-day.png',     'xmas-day-background.png', 'discrete-santa-day-background.png', 'xmas-background.jpg'],
  xmasEve:      ['bg-xmas-eve.png',     'xmas-eve-background.png'                            ],
  xmasNight:    ['bg-xmas-night.png',   'xmasy-night-background.png'                         ],
};

/** Shape of the optional skins.json manifest (key → filename). */
export type SkinsManifest = Partial<Record<ThemeKey, string>>;

/** Module-level manifest cache to avoid redundant network fetches. */
const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _manifestCache: { data: SkinsManifest | null; fetchedAt: number } | null = null;

/**
 * Maps Open-Meteo WMO weathercode to a theme key.
 * https://open-meteo.com/en/docs#weathervariables
 */
export function mapWeatherCodeToTheme(weathercode: number): ThemeKey | null {
  if (weathercode === 0 || weathercode === 1) return null; // clear — fall through to time-of-day
  if (weathercode === 2 || weathercode === 3) return null; // partly/overcast — time-of-day
  if (weathercode >= 51 && weathercode <= 67) return 'rain';        // drizzle / rain
  if (weathercode >= 71 && weathercode <= 77) return 'snow';        // snow
  if (weathercode >= 80 && weathercode <= 82) return 'rain';        // showers
  if (weathercode >= 85 && weathercode <= 86) return 'snowday';     // snow showers
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
  if (hour >= 5 && hour <= 7)   return 'sunrise';
  if (hour >= 8 && hour <= 17)  return 'day';
  if (hour >= 18 && hour <= 20) return 'sunset';
  return 'night';
}

export interface ResolvedTheme {
  key: ThemeKey;
  url: string;
  reason: string;
}

export interface ResolveOptions {
  geolocationTimeoutMs?: number;
  forceNoGeo?: boolean;
}

/** Returns true if the given URL responds with HTTP 2xx (file exists). */
export async function existsHead(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Attempts to fetch and parse `skins.json` from ASSETS_BASE.
 * Results are cached for MANIFEST_CACHE_TTL_MS to avoid repeated network requests.
 * Returns the manifest mapping or null on any failure.
 */
export async function fetchManifest(): Promise<SkinsManifest | null> {
  const now = Date.now();
  if (_manifestCache && now - _manifestCache.fetchedAt < MANIFEST_CACHE_TTL_MS) {
    return _manifestCache.data;
  }
  try {
    const res = await fetch(`${ASSETS_BASE}skins.json`);
    const data: SkinsManifest | null = res.ok ? (await res.json()) as SkinsManifest : null;
    _manifestCache = { data, fetchedAt: now };
    return data;
  } catch {
    _manifestCache = { data: null, fetchedAt: now };
    return null;
  }
}

/**
 * Resolves the asset URL for a key using a manifest entry.
 * Returns the URL if the manifest contains a filename for the key and that
 * file responds to a HEAD request; otherwise returns null.
 */
export async function resolveAssetForKeyWithManifest(
  key: ThemeKey,
  manifest: SkinsManifest,
): Promise<string | null> {
  const filename = manifest[key];
  if (!filename) return null;
  // Reject filenames containing path separators or null bytes — a bare filename
  // with no separators cannot cause path traversal regardless of encoding.
  if (filename.includes('/') || filename.includes('\\') || filename.includes('\0')) {
    console.warn('[backgroundTheme] manifest entry for', key, 'contains unsafe path; ignoring');
    return null;
  }
  const url = `${ASSETS_BASE}${filename}`;
  const ok = await existsHead(url);
  if (ok) {
    console.debug('[backgroundTheme] manifest hit for', key, '→', filename);
    return url;
  }
  console.debug('[backgroundTheme] manifest entry for', key, '(', filename, ') returned 404; will probe');
  return null;
}

/**
 * Resolves the asset URL for a key by probing CANDIDATES with HEAD requests.
 * All candidates are probed concurrently; the first hit in priority order wins.
 * Returns the first URL that exists, or the default fallback URL.
 */
export async function resolveAssetForKeyByProbing(key: ThemeKey): Promise<string> {
  const candidates = CANDIDATES[key] ?? [];
  const urls = candidates.map((f) => `${ASSETS_BASE}${f}`);
  const results = await Promise.all(urls.map((url) => existsHead(url)));
  const hitIndex = results.indexOf(true);
  if (hitIndex !== -1) {
    const url = urls[hitIndex];
    console.debug('[backgroundTheme] probe hit for', key, '→', candidates[hitIndex]);
    return url;
  }
  const fallback = `${ASSETS_BASE}${DEFAULT_FILE}`;
  console.debug('[backgroundTheme] no probe hit for', key, '; using default', DEFAULT_FILE);
  return fallback;
}

/**
 * Resolves the final asset URL for a theme key.
 * Tries the manifest first, then probing, then the default.
 */
async function resolveAssetUrl(key: ThemeKey, manifest: SkinsManifest | null): Promise<string> {
  if (manifest) {
    const url = await resolveAssetForKeyWithManifest(key, manifest);
    if (url) return url;
  }
  return resolveAssetForKeyByProbing(key);
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
  const day   = date.getDate();
  return (month === 12 && day >= 20) || (month === 1 && day === 1);
}

/** Picks the holiday sub-theme (Eve vs Day vs Night) within the window. */
function holidayKey(date: Date): ThemeKey {
  const month = date.getMonth() + 1;
  const day   = date.getDate();
  const hour  = date.getHours();

  if (month === 12 && day === 24) return hour >= 18 ? 'xmasEve'   : 'xmasDay';
  if (month === 12 && day === 25) return hour >= 18 ? 'xmasNight' : 'xmasDay';
  return hour >= 18 ? 'xmasNight' : 'xmasDay';
}

/**
 * Resolves the background theme to display.
 *
 * Resolution order:
 *   1. Holiday override (Dec 20 – Jan 1)
 *   2. Geolocation → Open-Meteo weather code → theme key
 *   3. Time-of-day fallback
 *
 * For each resolved theme key the asset URL is determined by:
 *   a. skins.json manifest (if present and the file exists)
 *   b. Probing CANDIDATES with HEAD requests
 *   c. DEFAULT_FILE fallback
 */
export async function resolveTheme(
  { geolocationTimeoutMs = 7000, forceNoGeo = false }: ResolveOptions = {},
): Promise<ResolvedTheme> {
  const now = new Date();

  // Fetch manifest once; failures are silently ignored
  const manifest = await fetchManifest();
  if (manifest) {
    console.debug('[backgroundTheme] skins.json manifest loaded');
  } else {
    console.debug('[backgroundTheme] skins.json not available; will probe candidates');
  }

  // 1. Holiday override
  if (isHolidayWindow(now)) {
    const key = holidayKey(now);
    const url = await resolveAssetUrl(key, manifest);
    console.info('[backgroundTheme] Holiday override →', key, url);
    return { key, url, reason: 'holiday' };
  }

  // 2. Geolocation + weather
  if (!forceNoGeo && typeof navigator !== 'undefined') {
    try {
      const position = await getPosition(geolocationTimeoutMs);
      const { latitude, longitude } = position.coords;
      console.debug('[backgroundTheme] Got position', latitude, longitude);
      const code = await fetchWeatherCode(latitude, longitude);
      console.debug('[backgroundTheme] weathercode', code);
      const weatherKey = mapWeatherCodeToTheme(code);
      if (weatherKey) {
        const url = await resolveAssetUrl(weatherKey, manifest);
        console.info('[backgroundTheme] Weather theme →', weatherKey, `(code ${code})`, url);
        return { key: weatherKey, url, reason: `weather:${code}` };
      }
      // Clear/overcast — fall through to time-of-day but note the source
      const todKey = timeOfDayKey(now);
      const url = await resolveAssetUrl(todKey, manifest);
      console.info('[backgroundTheme] Clear/overcast; time-of-day →', todKey, url);
      return { key: todKey, url, reason: `weather:${code}:timeofday` };
    } catch (err) {
      // Geo or network failure — fall through to time-of-day
      console.debug('[backgroundTheme] geo/weather unavailable:', err);
    }
  }

  // 3. Time-of-day fallback
  const key = timeOfDayKey(now);
  const url = await resolveAssetUrl(key, manifest);
  console.info('[backgroundTheme] Time-of-day fallback →', key, url);
  return { key, url, reason: 'timeofday' };
}
