/**
 * The admin target is for private testing only. Anything shipped to users
 * must use the release target, which never enables development entitlements
 * or debug access from a URL/local-storage value.
 */
export const BUILD_TARGET =
  import.meta.env.VITE_BUILD_TARGET === 'admin' || import.meta.env.MODE === 'admin'
    ? 'admin'
    : import.meta.env.DEV || import.meta.env.MODE === 'test'
      ? 'test'
      : 'release'

export const IS_ADMIN_BUILD = BUILD_TARGET === 'admin'
export const IS_RELEASE_BUILD = BUILD_TARGET === 'release'
