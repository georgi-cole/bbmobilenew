import { describe, expect, it } from 'vitest'
import {
  installE2EStateProbe,
  type E2EProbeHost,
  type E2EStateProbe,
} from '../../src/testSupport/e2eStateProbe'

type MutableHost = {
  __E2E__?: boolean
  __bbE2EState?: E2EStateProbe
}

describe('read-only E2E state probe', () => {
  it('is absent unless both the development and explicit E2E guards are enabled', () => {
    const ordinaryProduction: MutableHost = { __E2E__: true }
    const ordinaryDevelopment: MutableHost = {}

    expect(installE2EStateProbe(ordinaryProduction, () => ({}), false)).toBe(false)
    expect(installE2EStateProbe(ordinaryDevelopment, () => ({}), true)).toBe(false)
    expect(ordinaryProduction).not.toHaveProperty('__bbE2EState')
    expect(ordinaryDevelopment).not.toHaveProperty('__bbE2EState')
  })

  it('exposes only detached frozen snapshots and never dispatch or a store reference', () => {
    const host: MutableHost = { __E2E__: true }
    const liveState = {
      game: { phase: 'week_start', players: [{ id: 'p1', name: 'Player One' }] },
    }

    expect(installE2EStateProbe(host as E2EProbeHost, () => liveState, true)).toBe(true)
    expect(Object.keys(host.__bbE2EState ?? {})).toEqual(['snapshot'])
    expect(host.__bbE2EState).not.toHaveProperty('dispatch')
    expect(host.__bbE2EState).not.toHaveProperty('store')

    const snapshot = host.__bbE2EState?.snapshot() as typeof liveState
    expect(snapshot).toEqual(liveState)
    expect(snapshot).not.toBe(liveState)
    expect(snapshot.game).not.toBe(liveState.game)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.game.players)).toBe(true)
    expect(Object.isFrozen(snapshot.game.players[0])).toBe(true)

    liveState.game.phase = 'loh_comp'
    expect(snapshot.game.phase).toBe('week_start')
    expect(() => {
      snapshot.game.phase = 'nomination'
    }).toThrow(TypeError)
    expect(liveState.game.phase).toBe('loh_comp')
  })
})
