export interface PublicModeRuntimeAccess {
  hasStoreAccess: boolean
  adminOverride: boolean
  isDev: boolean
  hasSpecialAccess: boolean
}

export function resolvePublicModeRuntimeEnabled(
  requested: boolean,
  access: PublicModeRuntimeAccess
): boolean {
  return (
    requested &&
    (access.hasStoreAccess || access.adminOverride || access.isDev || access.hasSpecialAccess)
  )
}
