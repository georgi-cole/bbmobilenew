import { describe, expect, it } from 'vitest'
import gameReducer, { createInitialGameState, requestPublicModeChange } from '../gameSlice'
import { withImmediateVoxPublicMode } from '../voxPublicModeReducer'

const reducer = withImmediateVoxPublicMode(gameReducer)

describe('withImmediateVoxPublicMode', () => {
  it('applies Public Mode immediately while Vox Populi is active', () => {
    const initial = createInitialGameState({ seed: 812 })
    if (!initial.voxPopuli) throw new Error('Expected Vox Populi state')

    initial.voxPopuli.status = 'active'
    initial.phase = 'social_1'
    initial.publicModeEnabled = false
    initial.pendingPublicModeEnabled = null

    const enabled = reducer(initial, requestPublicModeChange(true))

    expect(enabled.publicModeEnabled).toBe(true)
    expect(enabled.pendingPublicModeEnabled).toBeNull()

    const disabled = reducer(enabled, requestPublicModeChange(false))
    expect(disabled.publicModeEnabled).toBe(false)
    expect(disabled.pendingPublicModeEnabled).toBeNull()
  })

  it('leaves normal mid-cycle Public Mode activation on the core next-day path', () => {
    const initial = createInitialGameState({ seed: 813 })
    if (!initial.voxPopuli) throw new Error('Expected Vox Populi state')

    initial.voxPopuli.status = 'inactive'
    initial.phase = 'social_1'
    initial.publicModeEnabled = false
    initial.pendingPublicModeEnabled = null

    const queued = reducer(initial, requestPublicModeChange(true))

    expect(queued.publicModeEnabled).toBe(false)
    expect(queued.pendingPublicModeEnabled).toBe(true)
  })
})
