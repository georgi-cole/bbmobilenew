export type RecapSceneKind =
  | 'intro'
  | 'photoshoot'
  | 'highlight_moment'
  | 'honor'
  | 'farewell'
  | 'moment_of_truth'

export interface RecapTimelineScene {
  id: string
  kind: RecapSceneKind
  startMs: number
  endMs: number
  durationMs: number
  highlightIndex?: number
  honorIndex?: number
  farewellIndex?: number
}

const SECOND = 1000

function seconds(value: number): number {
  return Math.round(value * SECOND)
}

export const INTRO_MIN_DURATION_MS = seconds(3.8)
export const RECAP_EXIT_FADE_MS = 420

const PHOTOSHOOT_DURATION_MS = seconds(7.2)
const HIGHLIGHT_MOMENT_DURATION_MS = seconds(5.8)
const HONOR_DURATION_MS = seconds(6.8)
const FAREWELL_DURATION_MS = seconds(5.4)
const MOMENT_OF_TRUTH_DURATION_MS = seconds(6.6)
const MAX_HIGHLIGHTS = 2
const MAX_HONORS = 3
const MAX_FAREWELL_GROUPS = 4

export function buildSeasonRecapTimeline(
  honorCount: number,
  farewellGroupCount: number,
  highlightCount = 0
): RecapTimelineScene[] {
  const safeHighlightCount = Math.min(MAX_HIGHLIGHTS, Math.max(0, highlightCount))
  const safeHonorCount = Math.min(MAX_HONORS, Math.max(0, honorCount))
  const safeFarewellCount = Math.min(MAX_FAREWELL_GROUPS, Math.max(0, farewellGroupCount))
  let cursorMs = 0

  const pushScene = (
    id: string,
    kind: RecapSceneKind,
    durationMs: number,
    extra: Partial<RecapTimelineScene> = {}
  ) => {
    const scene = {
      id,
      kind,
      startMs: cursorMs,
      endMs: cursorMs + durationMs,
      durationMs,
      ...extra,
    } satisfies RecapTimelineScene
    cursorMs += durationMs
    return scene
  }

  const timeline: RecapTimelineScene[] = [
    pushScene('intro_votes_in', 'intro', INTRO_MIN_DURATION_MS),
    pushScene('intro_before_final_word', 'intro', INTRO_MIN_DURATION_MS),
    pushScene('photoshoot', 'photoshoot', PHOTOSHOOT_DURATION_MS),
  ]

  for (let index = 0; index < safeHighlightCount; index += 1) {
    timeline.push(
      pushScene(`highlight_${index}`, 'highlight_moment', HIGHLIGHT_MOMENT_DURATION_MS, {
        highlightIndex: index,
      })
    )
  }

  for (let index = 0; index < safeHonorCount; index += 1) {
    timeline.push(
      pushScene(`honor_${index}`, 'honor', HONOR_DURATION_MS, {
        honorIndex: index,
      })
    )
  }

  for (let index = 0; index < safeFarewellCount; index += 1) {
    timeline.push(
      pushScene(`farewell_${index}`, 'farewell', FAREWELL_DURATION_MS, {
        farewellIndex: index,
      })
    )
  }

  timeline.push(pushScene('moment_of_truth', 'moment_of_truth', MOMENT_OF_TRUTH_DURATION_MS))
  return timeline
}

export const SEASON_RECAP_TIMELINE = buildSeasonRecapTimeline(3, 3, 2)
export const TOTAL_RECAP_DURATION_MS = SEASON_RECAP_TIMELINE.at(-1)?.endMs ?? 0
