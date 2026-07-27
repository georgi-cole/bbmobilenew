import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import type { Player } from '../../../types'
import AudienceVerdictReveal from '../AudienceVerdictReveal'

function makePlayer(id: string, name: string): Player {
  return { id, name, avatar: '🧑', status: 'nominated' }
}

const nominees = [makePlayer('a', 'Lia'), makePlayer('b', 'Nina'), makePlayer('c', 'Alex')]

describe('AudienceVerdictReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.classList.remove('no-animations')
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.classList.remove('no-animations')
  })

  it('shows the close-vote beat before revealing the saved nominee', () => {
    const onDone = vi.fn()
    render(
      <AudienceVerdictReveal
        nominees={nominees}
        voteShares={{ a: 34, b: 33, c: 33 }}
        savedId="a"
        onDone={onDone}
      />
    )

    act(() => {
      vi.advanceTimersByTime(2200)
    })
    expect(screen.getByText('TOO CLOSE TO CALL')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.getByText('LIA SAVED BY THE PUBLIC')).toBeTruthy()
    expect(screen.getByText('34% of the save vote')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(2800)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('completes the compact sequence in 6.2 seconds', () => {
    const onDone = vi.fn()
    render(
      <AudienceVerdictReveal
        nominees={nominees}
        voteShares={{ a: 42, b: 34, c: 24 }}
        savedId="a"
        onDone={onDone}
      />
    )

    act(() => {
      vi.advanceTimersByTime(6199)
    })
    expect(onDone).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('lets the player fast-forward by activating the broadcast', () => {
    const onDone = vi.fn()
    render(
      <AudienceVerdictReveal
        nominees={nominees}
        voteShares={{ a: 42, b: 34, c: 24 }}
        savedId="a"
        onDone={onDone}
      />
    )

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('LIA SAVED BY THE PUBLIC')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})
