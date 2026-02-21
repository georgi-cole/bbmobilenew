/**
 * backgroundTheme.ts
 *
 * Resolves which background image to display based on:
 *   1. Holiday override  (Dec 20 – Jan 1)
 *   2. Geolocation + Open-Meteo current weather (no API key required)
 *   3. Time-of-day fallback
 */

export const ASSETS_BASE = `${import.meta.env.BASE_URL}assets/skins/`;

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
 * Maps Open-Meteo WMO weathercode to a theme key.
 * https://open-meteo.com/en/docs#weathervariables
 */
export function mapWeatherCodeToTheme(weathercode: number): ThemeKey | null {
  if (weathercode === 0 || weathercode === 1) return null; // clear — fall through to time-of-day
  if (weathercode === 2 || weathercode === 3) return null; // partly/overcast — time-of-day
  if (weathercode >= 51 && weathercode <= 67) return 'rain';   // drizzle / rain
  if (weathercode >= 71 && weathercode <= 77) return 'snow';   // snow
  if (weathercode >= 80 && weathercode <= 82) return 'rain';   // showers
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
  if (hour >= 5 && hour <= 7)  return 'sunrise';
  if (hour >= 8 && hour <= 17) return 'day';
  if (hour >= 18 && hour <= 20) return 'sunset';
  return 'night';
}

export interface ResolvedTheme {
  key: ThemeKey;
  url: string;
  reason: string;
}

interface ResolveOptions {
  geolocationTimeoutMs?: number;
  forceNoGeo?: boolean;
}

function buildUrl(key: ThemeKey): string {
  // URL is constructed solely from ASSETS_BASE (a constant) and a static
  // filename from the BACKGROUNDS map — no user input is involved.
  return `${ASSETS_BASE}${BACKGROUNDS[key].file}`;
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
 */
export async function resolveTheme(
  { geolocationTimeoutMs = 7000, forceNoGeo = false }: ResolveOptions = {},
): Promise<ResolvedTheme> {
  const now = new Date();

  // 1. Holiday override
  if (isHolidayWindow(now)) {
    const key = holidayKey(now);
    return { key, url: buildUrl(key), reason: 'holiday' };
  }

  // 2. Geolocation + weather
  if (!forceNoGeo && typeof navigator !== 'undefined') {
    try {
      const position = await getPosition(geolocationTimeoutMs);
      const { latitude, longitude } = position.coords;
      const code = await fetchWeatherCode(latitude, longitude);
      const weatherKey = mapWeatherCodeToTheme(code);
      if (weatherKey) {
        return { key: weatherKey, url: buildUrl(weatherKey), reason: `weather:${code}` };
      }
      // Clear/overcast — fall through to time-of-day but note the source
      const todKey = timeOfDayKey(now);
      return { key: todKey, url: buildUrl(todKey), reason: `weather:${code}:timeofday` };
    } catch (err) {
      // Geo or network failure — fall through to time-of-day
      console.debug('[backgroundTheme] geo/weather unavailable:', err);
    }
  }

  // 3. Time-of-day fallback
  const key = timeOfDayKey(now);
  return { key, url: buildUrl(key), reason: 'timeofday' };
}
