/**
 * featureFlags — compile-time feature flag constants derived from env vars.
 *
 * Vite only exposes VITE_* variables on import.meta.env by default.
 *
 * Convention: a flag is "enabled" (true) unless the env var is explicitly set
 * to the string "false".
 */

/**
 * FEATURE_SOCIAL_V2 — when true (default) the new SocialPanelV2 is used and
 * the legacy SocialPanel is hidden from the UI.
 * Set VITE_FEATURE_SOCIAL_V2=false in .env to re-enable the old module.
 */
export const FEATURE_SOCIAL_V2: boolean =
  (import.meta.env.VITE_FEATURE_SOCIAL_V2 ?? 'true') !== 'false';

/**
 * FEATURE_SPECTATOR_REACT — when true (default) the React SpectatorView
 * overlay is mounted by GameScreen during Final 3 Part 3 when the human
 * player is a spectator (not a finalist), and also in response to the
 * 'spectator:show' CustomEvent dispatched by the legacy adapter.
 * Set VITE_FEATURE_SPECTATOR_REACT=false in .env to disable it.
 */
export const FEATURE_SPECTATOR_REACT: boolean =
  (import.meta.env.VITE_FEATURE_SPECTATOR_REACT ?? 'true') !== 'false';
