import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBattleBackVoting } from '../useBattleBackVoting'

describe('useBattleBackVoting final-two hold', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps two active players visible for the added hold before completing', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() =>
      useBattleBackVoting({
        candidates: ['a', 'b', 'c'],
        seed: 17,
        eliminationIntervalMs: 100,
        finalTwoHoldMs: 400,
        tickIntervalMs: 1000,
      })
    )
    const activeCount = () => Object.values(result.current.votes).filter((vote) => vote > 0).length

    act(() => vi.advanceTimersByTime(100))
    expect(activeCount()).toBe(2)

    act(() => vi.advanceTimersByTime(399))
    expect(activeCount()).toBe(2)
    expect(result.current.isComplete).toBe(false)

    act(() => vi.advanceTimersByTime(1500))
    expect(activeCount()).toBe(1)
    expect(result.current.isComplete).toBe(true)
  })
})
