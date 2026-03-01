/**
 * animations.ts — Helpers for reading the user's animations preference.
 *
 * isAnimationsEnabled()   — synchronous localStorage read, safe for legacy
 *                           modules that run outside the React lifecycle.
 * useAnimationsEnabled()  — React hook backed by the Redux store for components
 *                           that need reactivity.
 */

import { useAppSelector } from '../store/hooks';
import { selectSettings } from '../store/settingsSlice';

const STORAGE_KEY = 'bbmobilenew_settings_v1';

/**
 * Synchronously checks whether the user has animations enabled.
 * Reads directly from localStorage so it is safe to call outside of React.
 * Defaults to `true` when no setting is found or on any parse error.
 */
export function isAnimationsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw) as { gameUX?: { animations?: boolean } };
    return parsed.gameUX?.animations ?? true;
  } catch {
    return true;
  }
}

/**
 * React hook that returns the animations flag from the Redux store.
 * Re-renders the consuming component whenever the setting changes.
 */
export function useAnimationsEnabled(): boolean {
  return useAppSelector(selectSettings).gameUX.animations;
}
