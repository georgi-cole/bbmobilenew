import { describe, expect, it } from 'vitest'
import { resolvePublicModeRuntimeEnabled } from '../../src/publicOpinion/publicModeAccess'

describe('resolvePublicModeRuntimeEnabled', () => {
  const noAccess = {
    hasStoreAccess: false,
    adminOverride: false,
    isDev: false,
    hasSpecialAccess: false,
  }

  it('keeps Public Mode off when it was not requested', () => {
    expect(resolvePublicModeRuntimeEnabled(false, { ...noAccess, adminOverride: true })).toBe(false)
  })

  it('honors the persisted Advanced Settings override after debug URL access is gone', () => {
    expect(resolvePublicModeRuntimeEnabled(true, { ...noAccess, adminOverride: true })).toBe(true)
  })

  it('keeps runtime access locked without entitlement, override, dev, or QA access', () => {
    expect(resolvePublicModeRuntimeEnabled(true, noAccess)).toBe(false)
  })
})
