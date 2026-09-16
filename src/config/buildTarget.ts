/**
 * Build targets deliberately separate gameplay debugging from monetisation
 * testing. The mobile-dev target behaves like a release build for debug access
 * and choreography, while allowing paid entitlements / ad rewards to be
 * simulated on a locally installed native app.
 */
export type BuildTarget = 'admin' | 'test' | 'mobile-dev' | 'release'

export function resolveBuildTarget(input: {
  explicitTarget?: string
  mode: string
  isDev: boolean
}): BuildTarget {
  if (input.explicitTarget === 'admin' || input.mode === 'admin') return 'admin'
  if (input.explicitTarget === 'mobile-dev') return 'mobile-dev'
  if (input.isDev || input.mode === 'test') return 'test'
  return 'release'
}

export const BUILD_TARGET = resolveBuildTarget({
  explicitTarget: import.meta.env.VITE_BUILD_TARGET,
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
})

export const IS_ADMIN_BUILD = BUILD_TARGET === 'admin'
export const IS_MOBILE_DEV_BUILD = BUILD_TARGET === 'mobile-dev'

// mobile-dev intentionally keeps production debug/security gating even though
// its monetisation layer is simulated.
export const IS_RELEASE_BUILD = BUILD_TARGET === 'release' || IS_MOBILE_DEV_BUILD
