import { describe, expect, it } from 'vitest'
import { resolveBuildTarget } from './buildTarget'

describe('resolveBuildTarget', () => {
  it('selects mobile-dev only when explicitly requested', () => {
    expect(resolveBuildTarget({ explicitTarget: 'mobile-dev', mode: 'ios', isDev: false })).toBe(
      'mobile-dev'
    )
  })

  it('keeps the normal iOS build on the release target', () => {
    expect(resolveBuildTarget({ mode: 'ios', isDev: false })).toBe('release')
  })

  it('keeps admin and test behavior unchanged', () => {
    expect(resolveBuildTarget({ explicitTarget: 'admin', mode: 'ios', isDev: false })).toBe('admin')
    expect(resolveBuildTarget({ mode: 'test', isDev: false })).toBe('test')
    expect(resolveBuildTarget({ mode: 'development', isDev: true })).toBe('test')
  })
})
