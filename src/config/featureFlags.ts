/**
 * featureFlags — compile-time feature flag constants derived from env vars.
 *
 * Vite exposes VITE_* variables on import.meta.env.  For compatibility with
 * CRA-style builds, REACT_APP_* counterparts are also checked.
 *
 * Convention: a flag is "enabled" (true) unless the env var is explicitly set
 * to the string "false".
 */

/**
 * FEATURE_SOCIAL_V2 — when true (default) the new SocialPanelV2 is used and
 * the legacy SocialPanel is hidden from the UI.
 * Set VITE_FEATURE_SOCIAL_V2=false (or REACT_APP_FEATURE_SOCIAL_V2=false) to
 * re-enable the old module.
 */
export const FEATURE_SOCIAL_V2: boolean =
  (
    import.meta.env.VITE_FEATURE_SOCIAL_V2 ??
    import.meta.env.REACT_APP_FEATURE_SOCIAL_V2 ??
    'true'
  ) !== 'false';
