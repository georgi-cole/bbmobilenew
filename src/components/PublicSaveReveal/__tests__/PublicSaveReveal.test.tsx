import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import type { CupidArrowPair, Player } from '../../../types'
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

describe('PublicSaveReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.body.classList.remove('no-animations')
    store.dispatch(setGameUX({ dramaMode: false }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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

  it('preserves the original timing and saved-player treatment', () => {
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

  it('uses the original Normal Mode visual when Drama Mode is enabled', () => {
    const currentState = store.getState()
    vi.spyOn(store, 'getState').mockReturnValue({
      ...currentState,
      game: {
        ...currentState.game,
        publicModeEnabled: true,
      },
      settings: {
        ...currentState.settings,
        gameUX: {
          ...currentState.settings.gameUX,
          dramaMode: true,
        },
      },
    })

    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{ ...rawApprovals }}
        savedId="p3"
        onDone={vi.fn()}
      />
    )

    expect(document.querySelector('.psr')).toBeTruthy()
    expect(document.querySelector('.avr')).toBeNull()
    expect(screen.getAllByText('?? %')).toHaveLength(3)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.queryByText('?? %')).toBeNull()
    expect(
      screen
        .getAllByText(/%$/)
        .map((element) => element.textContent)
        .filter(Boolean)
    ).toHaveLength(3)
  })

  it('groups six Cupid nominees into three readable pair cards with shared percentages', () => {
    const cupidNominees = Array.from({ length: 6 }, (_, index) =>
      makePlayer(`c${index + 1}`, `Cupid ${index + 1}`)
    )
    const pairs: CupidArrowPair[] = [
      { id: 'pair-1', memberIds: ['c1', 'c2'], color: '#ff5d8f' },
      { id: 'pair-2', memberIds: ['c3', 'c4'], color: '#5bbcff' },
      { id: 'pair-3', memberIds: ['c5', 'c6'], color: '#ffc857' },
    ]

    render(
      <PublicSaveReveal
        nominees={cupidNominees}
        approvals={{ c1: 70, c2: 70, c3: 50, c4: 50, c5: 30, c6: 30 }}
        savedId="c1"
        pairs={pairs}
        onDone={vi.fn()}
      />
    )

    expect(document.querySelectorAll('.psr__nominee')).toHaveLength(3)
    expect(document.querySelectorAll('.psr__avatar-member')).toHaveLength(6)
    expect(screen.getByText('Cupid 1 & Cupid 2')).toBeTruthy()
    expect(screen.getAllByText('?? %')).toHaveLength(3)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(screen.queryByText('?? %')).toBeNull()
    expect(screen.getByText('46.6%')).toBeTruthy()
  })
})
