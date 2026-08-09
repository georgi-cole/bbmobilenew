import { clamp01, easedRange } from '../utils/math'

export type RgbSplitGlitchStateInput = {
  frame: number
  enterFrame: number
  exitFrame: number
  seed: number
}

// Long enough to register as an intentional cinematic reveal at 30fps, while
// still leaving the credit readable for the overwhelming majority of its card.
const GLITCH_ENTER_FRAMES = 20
const GLITCH_EXIT_FRAMES = 12
const BURST_PATTERN = [0.22, 0.92, 0.46, 1, 0.58, 0.84, 0.3, 0.7] as const

export function getRgbSplitGlitchState({
  frame,
  enterFrame,
  exitFrame,
  seed,
}: RgbSplitGlitchStateInput) {
  const enter = easedRange(frame, enterFrame, enterFrame + GLITCH_ENTER_FRAMES)
  const exit = easedRange(frame, exitFrame - GLITCH_EXIT_FRAMES, exitFrame)
  const enteringAmount = 1 - enter
  const amount = clamp01(Math.max(enteringAmount, exit))
  const patternIndex = Math.abs(Math.floor(frame + seed * 3)) % BURST_PATTERN.length
  const burst = BURST_PATTERN[patternIndex] ?? 0
  const displacement = amount * (3.5 + burst * 6.5)
  const phase = exit > 0 ? 'exiting' : enter < 1 ? 'entering' : 'settled'

  return {
    phase,
    amount,
    burst,
    displacement,
  } as const
}
