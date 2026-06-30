export const COMPACT_ROSTER_PROMPT_MIN_HEIGHT = 760
export const COMPACT_ROSTER_PROMPT_MIN_WIDTH = 430

export function shouldPromptForCompactRoster(options: {
  viewportWidth: number
  viewportHeight: number
  gameShellScrollHeight?: number | null
}): boolean {
  const { viewportWidth, viewportHeight, gameShellScrollHeight } = options
  const crowdedByViewport =
    viewportHeight < COMPACT_ROSTER_PROMPT_MIN_HEIGHT ||
    viewportWidth < COMPACT_ROSTER_PROMPT_MIN_WIDTH
  const crowdedByOverflow =
    typeof gameShellScrollHeight === 'number' &&
    gameShellScrollHeight > viewportHeight + 24

  return crowdedByViewport || crowdedByOverflow
}
