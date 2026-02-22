/**
 * SocialEnergyBank — per-player energy bank backed by Redux state.
 *
 * Public API:
 *   initEnergyBank(store)         — wire the Redux store (call once at bootstrap)
 *   get(playerId)                 → current energy for the player (0 if absent)
 *   set(playerId, value)          — set energy to an exact value
 *   add(playerId, delta)          → new energy value after applying delta
 *   resetIfNeeded()               — prepared for future use; currently a no-op
 *
 * All mutations dispatch Redux actions so changes are persisted in
 * `state.social.energyBank`.
 */

import { setEnergyBankEntry } from './socialSlice';
import type { SocialEnergyBank as SocialEnergyBankType } from './types';

// ── Internal store reference ──────────────────────────────────────────────

interface StoreAPI {
  dispatch: (action: unknown) => unknown;
  getState: () => unknown;
}

interface StateForBank {
  social: {
    energyBank: SocialEnergyBankType;
  };
}

let _store: StoreAPI | null = null;

/** Wire the Redux store so bank operations persist to `state.social.energyBank`. */
export function initEnergyBank(store: StoreAPI): void {
  _store = store;
}

// ── Bank operations ───────────────────────────────────────────────────────

/** Return the current energy for playerId (0 if the player has no entry). */
export function get(playerId: string): number {
  if (!_store) {
    console.warn('SocialEnergyBank: get() called before initEnergyBank()');
    return 0;
  }
  const state = _store.getState() as StateForBank;
  return state.social.energyBank[playerId] ?? 0;
}

/** Set the energy for playerId to an exact value. */
export function set(playerId: string, value: number): void {
  if (!_store) {
    console.warn('SocialEnergyBank: set() called before initEnergyBank()');
    return;
  }
  _store.dispatch(setEnergyBankEntry({ playerId, value }));
}

/**
 * Add delta to the player's current energy (use a negative delta to deduct).
 * Energy is clamped at a minimum of 0.
 * Returns the new energy value.
 */
export function add(playerId: string, delta: number): number {
  if (!_store) {
    console.warn('SocialEnergyBank: add() called before initEnergyBank()');
    return 0;
  }
  const current = get(playerId);
  const value = Math.max(0, current + delta);
  _store.dispatch(setEnergyBankEntry({ playerId, value }));
  return value;
}

/** Prepared for future phase-reset logic; currently a no-op. */
export function resetIfNeeded(): void {
  // no-op – reserved for future use
}

// ── Named export for convenience ──────────────────────────────────────────

export const SocialEnergyBank = { get, set, add, resetIfNeeded };
