import { waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isHostedMinigamePlaying,
  observeHostedMinigamePlaying,
} from '../../../src/services/sound/minigameHostPhaseObserver'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('hosted minigame phase observer', () => {
  it('tracks the real shared host playing view', async () => {
    const onChange = vi.fn()
    const stop = observeHostedMinigamePlaying(onChange)

    expect(isHostedMinigamePlaying()).toBe(false)
    expect(onChange).toHaveBeenLastCalledWith(false)

    const playingView = document.createElement('div')
    playingView.className = 'minigame-host-playing'
    document.body.appendChild(playingView)

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(true))
    expect(isHostedMinigamePlaying()).toBe(true)

    playingView.remove()
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(false))

    stop()
  })
})
