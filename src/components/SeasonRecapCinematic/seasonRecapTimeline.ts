export type RecapSceneKind =
  | 'intro'
  | 'cast_overview'
  | 'highlight_moment'
  | 'category'
  | 'ladder_intro'
  | 'ladder_wave'
  | 'moment_of_truth'

export interface RecapTimelineScene {
  id: string
  kind: RecapSceneKind
  startMs: number
  endMs: number
  durationMs: number
  categoryId?: string
  ladderWaveIndex?: number
  highlightIndex?: number
}

const SECOND = 1000

function seconds(value: number): number {
  return Math.round(value * SECOND)
}

export const CATEGORY_SCENE_DURATION_MS = seconds(8.2)
export const INTRO_MIN_DURATION_MS = seconds(4.2)
export const RECAP_EXIT_FADE_MS = 420

const CAST_OVERVIEW_DURATION_MS = seconds(6.2)
const HIGHLIGHT_MOMENT_DURATION_MS = seconds(5.2)
const LADDER_INTRO_DURATION_MS = seconds(3.2)
const LADDER_WAVE_DURATION_MS = seconds(7.2)
const MOMENT_OF_TRUTH_DURATION_MS = seconds(6)
const MAX_HIGHLIGHTS = 3

export function buildSeasonRecapTimeline(
  categoryIds: string[],
  evictionWaveCount: number,
  highlightCount = 0
): RecapTimelineScene[] {
  const safeHighlightCount = Math.min(MAX_HIGHLIGHTS, Math.max(0, highlightCount))
  const safeWaveCount = Math.max(0, evictionWaveCount)
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
    pushScene('cast_overview', 'cast_overview', CAST_OVERVIEW_DURATION_MS),
  ]

  for (let index = 0; index < safeHighlightCount; index += 1) {
    timeline.push(
      pushScene(`highlight_${index}`, 'highlight_moment', HIGHLIGHT_MOMENT_DURATION_MS, {
        highlightIndex: index,
      })
    )
  }

  categoryIds.forEach((categoryId) => {
    timeline.push(
      pushScene(`category_${categoryId}`, 'category', CATEGORY_SCENE_DURATION_MS, {
        categoryId,
      })
    )
  })

  if (safeWaveCount > 0) {
    timeline.push(pushScene('ladder_intro', 'ladder_intro', LADDER_INTRO_DURATION_MS))
    for (let index = 0; index < safeWaveCount; index += 1) {
      timeline.push(
        pushScene(`ladder_wave_${index}`, 'ladder_wave', LADDER_WAVE_DURATION_MS, {
          ladderWaveIndex: index,
        })
      )
    }
  }

  timeline.push(pushScene('moment_of_truth', 'moment_of_truth', MOMENT_OF_TRUTH_DURATION_MS))
  return timeline
}

const DEFAULT_CATEGORY_IDS = [
  'compzilla',
  'head_honcho',
  'mess_factory',
  'ghost_mode',
  'vibe_curator',
  'heat_magnet',
]

export const SEASON_RECAP_TIMELINE = buildSeasonRecapTimeline(DEFAULT_CATEGORY_IDS, 4, 3)
export const TOTAL_RECAP_DURATION_MS = SEASON_RECAP_TIMELINE.at(-1)?.endMs ?? 0
