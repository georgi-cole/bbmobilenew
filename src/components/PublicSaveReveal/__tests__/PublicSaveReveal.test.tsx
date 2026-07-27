import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { Player } from '../../../types'
import { store } from '../../../store/store'
import { setGameUX } from '../../../store/settingsSlice'
import { normalisePublicSaveVoteShares } from '../../../publicOpinion/PublicSaveService'
import PublicSaveReveal from '../PublicSaveReveal'

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    avatar: '🧑',
    status: 'nominated',
  }
}

const nominees = [makePlayer('p1', 'Blue'), makePlayer('p2', 'Kian'), makePlayer('p3', 'Georgi')]

const rawApprovals = {
  p1: 42,
  p2: 43,
  p3: 50,
}

function formatShare(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`
}

describe('PublicSaveReveal in Normal Mode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.classList.remove('no-animations')
    store.dispatch(setGameUX({ dramaMode: false }))
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.classList.remove('no-animations')
  })

  it('keeps vote shares hidden until the existing five-second reveal point', () => {
    const expectedShares = normalisePublicSaveVoteShares(
      nominees.map((nominee) => nominee.id),
      rawApprovals
    )

    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ ...rawApprovals }}
        savedId="p3"
        onDone={vi.fn()}
      />
    )

    expect(screen.getAllByText('?? %')).toHaveLength(3)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.queryByText('?? %')).toBeNull()
    nominees.forEach((nominee) => {
      expect(screen.getByText(formatShare(expectedShares[nominee.id]))).toBeTruthy()
    })
  })

  it('shows honest tied vote shares without inventing a decimal lead', () => {
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ p1: 25, p2: 50, p3: 50 }}
        savedId="p3"
        onDone={vi.fn()}
      />
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.getAllByText('40%')).toHaveLength(2)
    expect(screen.queryByText('40.1%')).toBeNull()
    expect(screen.queryByText('39.9%')).toBeNull()
  })

  it('preserves the current Normal Mode timing and saved-player treatment', () => {
    const onDone = vi.fn()
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ ...rawApprovals }}
        savedId="p3"
        onDone={onDone}
      />
    )

    act(() => {
      vi.advanceTimersByTime(7600)
    })
    expect(document.querySelector('.psr__nominee--saved')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(2399)
    })
    expect(onDone).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('hands the existing result flow vote shares that total exactly 100%', () => {
    const approvals = { ...rawApprovals }
    const onDone = vi.fn()

    render(
      <PublicSaveReveal nominees={nominees} approvals={approvals} savedId="p3" onDone={onDone} />
    )

    act(() => {
      vi.advanceTimersByTime(10000)
    })

    expect(onDone).toHaveBeenCalledTimes(1)
    expect(Object.values(approvals).reduce((sum, value) => sum + value, 0)).toBe(100)
    expect(approvals.p3).toBeGreaterThan(approvals.p2)
  })
})
