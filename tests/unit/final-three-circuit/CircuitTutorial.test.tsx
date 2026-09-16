import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CircuitTutorial from '../../../src/components/FinalThreeCircuit/CircuitTutorial'

afterEach(() => {
  vi.useRealTimers()
})

describe('Final Three Circuit interactive tutorials', () => {
  it('requires a Signal Hunt practice hit before starting', () => {
    const onComplete = vi.fn()
    render(<CircuitTutorial kind="signal" onComplete={onComplete} />)

    const start = screen.getByRole('button', { name: 'Try the practice move first' })
    expect(start).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '7' }))
    expect(screen.getByRole('button', { name: 'Start Signal Hunt' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Start Signal Hunt' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('teaches Sequence Builder with a legal adjacent slide', () => {
    const onComplete = vi.fn()
    render(<CircuitTutorial kind="sequence" onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('button', { name: '5' }))
    expect(screen.getByText(/Tile 5 could move because it touched the empty slot/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start Sequence Builder' })).toBeEnabled()
  })

  it('demonstrates one player move followed by two guard moves', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    render(<CircuitTutorial kind="warden" onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Practice move' }))
    act(() => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.getByText(/guard moved right first, then down/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose Warden difficulty' })).toBeEnabled()
  })

  it('shows that Power Balance commitments are irreversible', () => {
    const onComplete = vi.fn()
    render(<CircuitTutorial kind="power" onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('button', { name: /POWER CELL \+8/i }))
    expect(screen.getByText(/permanently committed/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose Power difficulty' })).toBeEnabled()
  })

  it('requires one correct Final Override practice answer', () => {
    const onComplete = vi.fn()
    render(<CircuitTutorial kind="override" onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('button', { name: '31' }))
    expect(screen.getByText(/47 is only 3 away from 50/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try the practice move first' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '47' }))
    expect(screen.getByRole('button', { name: 'Begin Final Override' })).toBeEnabled()
  })
})
