/**
 * featureFlags — compile-time feature flag constants derived from env vars.
 *
 * Vite only exposes VITE_* variables on import.meta.env by default.
 *
 * Most established flags are enabled unless explicitly set to "false".
 * Features that are not release-ready must opt in explicitly.
 */

/**
 * FEATURE_SOCIAL_V2 — when true (default) the new SocialPanelV2 is used and
 * the legacy SocialPanel is hidden from the UI.
 * Set VITE_FEATURE_SOCIAL_V2=false in .env to re-enable the old module.
 */
export const FEATURE_SOCIAL_V2: boolean =
  (import.meta.env.VITE_FEATURE_SOCIAL_V2 ?? 'true') !== 'false'

/**
 * FEATURE_SPECTATOR_REACT — when true (default) the React SpectatorView
 * overlay is mounted by GameScreen during Final 3 Part 3 when the human
 * player is a spectator (not a finalist), and also in response to the
 * 'spectator:show' CustomEvent dispatched by the legacy adapter.
 * Set VITE_FEATURE_SPECTATOR_REACT=false in .env to disable it.
 */
export const FEATURE_SPECTATOR_REACT: boolean =
  (import.meta.env.VITE_FEATURE_SPECTATOR_REACT ?? 'true') !== 'false'

/**
 * FEATURE_LOCALIZATION_SETTINGS — exposes the language selector in Settings.
 * Localization infrastructure remains active while this is disabled, but
 * players cannot select a partial language pack before the full game is ready.
 * Set VITE_FEATURE_LOCALIZATION_SETTINGS=true for development or a later release.
 */
export const FEATURE_LOCALIZATION_SETTINGS: boolean =
  (import.meta.env.VITE_FEATURE_LOCALIZATION_SETTINGS ?? 'false') === 'true'
