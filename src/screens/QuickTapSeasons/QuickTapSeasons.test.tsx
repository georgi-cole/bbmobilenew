import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import QuickTapSeasons from './QuickTapSeasons'

describe('QuickTapSeasons', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts the 40-second clock after the race begins', () => {
    render(<QuickTapSeasons />)

    fireEvent.click(screen.getByRole('button', { name: 'Start 40s race' }))
    expect(screen.getByText('40.0s')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.getByText('39.5s')).toBeTruthy()
  })

  it('finishes the race when the 40-second clock expires', () => {
    const onFinish = vi.fn()
    render(<QuickTapSeasons onFinish={onFinish} />)

    fireEvent.click(screen.getByRole('button', { name: 'Start 40s race' }))

    act(() => {
      vi.advanceTimersByTime(40_000)
    })

    expect(screen.getByRole('heading', { name: /won/i })).toBeTruthy()
    expect(onFinish).toHaveBeenCalledOnce()
    expect(onFinish).toHaveBeenCalledWith(0)
  })

  it('advances the clock from tap input when interval callbacks are delayed', () => {
    render(<QuickTapSeasons />)

    fireEvent.click(screen.getByRole('button', { name: 'Start 40s race' }))
    vi.setSystemTime(new Date('2026-08-25T12:00:00.500Z'))
    fireEvent.pointerDown(screen.getByRole('button', { name: /TAP/ }))

    expect(screen.getByText('39.5s')).toBeTruthy()
  })

  it('keeps the hosted auto-start timer running in Strict Mode', () => {
    render(
      <StrictMode>
        <QuickTapSeasons autoStart />
      </StrictMode>
    )

    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(screen.getByText('40.0s')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.getByText('39.5s')).toBeTruthy()
  })
})
