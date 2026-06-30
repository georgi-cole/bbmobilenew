import { describe, it, expect } from 'vitest'
import { shouldPromptForCompactRoster } from '../compactRosterPrompt'

describe('shouldPromptForCompactRoster', () => {
  it('prompts when the viewport is too short', () => {
    expect(
      shouldPromptForCompactRoster({
        viewportWidth: 1024,
        viewportHeight: 600,
      }),
    ).toBe(true)
  })

  it('prompts when the viewport is too narrow', () => {
    expect(
      shouldPromptForCompactRoster({
        viewportWidth: 360,
        viewportHeight: 900,
      }),
    ).toBe(true)
  })

  it('prompts when the game shell overflows the viewport', () => {
    expect(
      shouldPromptForCompactRoster({
        viewportWidth: 1024,
        viewportHeight: 800,
        gameShellScrollHeight: 840,
      }),
    ).toBe(true)
  })

  it('does not prompt for a roomy layout', () => {
    expect(
      shouldPromptForCompactRoster({
        viewportWidth: 1280,
        viewportHeight: 900,
        gameShellScrollHeight: 880,
      }),
    ).toBe(false)
  })
})
