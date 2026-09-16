import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FinalOverrideChallenge from '../../../src/components/FinalThreeCircuit/FinalOverrideChallenge'

const CORRECT_BY_PROMPT: Record<string, string> = {
  'Tap the largest value': '41',
  'Tap the only even value': '28',
  'Tap the shape with four sides': 'Square',
  'Tap the value closest to 50': '47',
  '9 + 8 = ?': '17',
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Final Override completion', () => {
  it('shows a terminal result and hands it back when the player locks it in', () => {
    vi.useFakeTimers()
    const onFinish = vi.fn()
    render(<FinalOverrideChallenge seed={424242} stake={0.4} onFinish={onFinish} />)

    for (let round = 0; round < 5; round += 1) {
      const prompt = screen.getByText(Object.keys(CORRECT_BY_PROMPT).find((text) => screen.queryByText(text))!)
      const correct = CORRECT_BY_PROMPT[prompt.textContent ?? '']
      fireEvent.click(screen.getByRole('button', { name: correct }))
      act(() => {
        vi.advanceTimersByTime(300)
      })
    }

    expect(screen.getByText('Override accepted')).toBeVisible()
    expect(screen.getByText('5 / 5')).toBeVisible()
    expect(onFinish).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Lock in result' }))
    expect(onFinish).toHaveBeenCalledWith(true)
    expect(onFinish).toHaveBeenCalledTimes(1)
  })
})
