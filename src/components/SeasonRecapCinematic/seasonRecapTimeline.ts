export type RecapSceneKind =
  | 'intro'
  | 'headline_girls'
  | 'phone_post_boys'
  | 'category'
  | 'ladder_intro'
  | 'ladder_wave'
  | 'moment_of_truth';

export interface RecapTimelineScene {
  id: string;
  kind: RecapSceneKind;
  startMs: number;
  endMs: number;
  durationMs: number;
  categoryId?: string;
  montageBeatIndex?: number;
  ladderWaveIndex?: number;
}

const SECOND = 1000;

function seconds(value: number): number {
  return Math.round(value * SECOND);
}

export const CATEGORY_SCENE_DURATION_MS = seconds(9.5);
export const INTRO_MIN_DURATION_MS = seconds(4.5);
export const RECAP_EXIT_FADE_MS = 420;

const HEADLINE_GIRLS_DURATION_MS = seconds(4);
const PHONE_POST_BOYS_DURATION_MS = seconds(4);
const LADDER_INTRO_DURATION_MS = seconds(3.5);
const LADDER_WAVE_DURATION_MS = seconds(4.25);
const MOMENT_OF_TRUTH_DURATION_MS = seconds(6);

export function buildSeasonRecapTimeline(categoryIds: string[], evictionWaveCount: number): RecapTimelineScene[] {
  const safeWaveCount = Math.max(evictionWaveCount, 1);
  let cursorMs = 0;

  const pushScene = (
    id: string,
    kind: RecapSceneKind,
    durationMs: number,
    extra: Partial<RecapTimelineScene> = {},
  ) => {
    const scene = {
      id,
      kind,
      startMs: cursorMs,
      endMs: cursorMs + durationMs,
      durationMs,
      ...extra,
    } satisfies RecapTimelineScene;
    cursorMs += durationMs;
    return scene;
  };

  const timeline: RecapTimelineScene[] = [
    pushScene('intro_votes_in', 'intro', INTRO_MIN_DURATION_MS),
    pushScene('intro_before_final_word', 'intro', INTRO_MIN_DURATION_MS),
    pushScene('headline_girls', 'headline_girls', HEADLINE_GIRLS_DURATION_MS),
    pushScene('phone_post_boys', 'phone_post_boys', PHONE_POST_BOYS_DURATION_MS),
  ];

  categoryIds.forEach((categoryId) => {
    timeline.push(
      pushScene(`category_${categoryId}`, 'category', CATEGORY_SCENE_DURATION_MS, {
        categoryId,
      }),
    );
  });

  timeline.push(pushScene('ladder_intro', 'ladder_intro', LADDER_INTRO_DURATION_MS));

  for (let index = 0; index < safeWaveCount; index += 1) {
    timeline.push(
      pushScene(`ladder_wave_${index}`, 'ladder_wave', LADDER_WAVE_DURATION_MS, {
        ladderWaveIndex: index,
      }),
    );
  }

  timeline.push(pushScene('moment_of_truth', 'moment_of_truth', MOMENT_OF_TRUTH_DURATION_MS));

  return timeline;
}

const DEFAULT_CATEGORY_IDS = [
  'compzilla',
  'head_honcho',
  'mess_factory',
  'ghost_mode',
  'vibe_curator',
  'heat_magnet',
];

export const SEASON_RECAP_TIMELINE = buildSeasonRecapTimeline(DEFAULT_CATEGORY_IDS, 4);
export const TOTAL_RECAP_DURATION_MS = SEASON_RECAP_TIMELINE.at(-1)?.endMs ?? 0;
