export type RecapSceneKind =
  | 'intro'
  | 'montage'
  | 'headline_girls'
  | 'phone_post_boys'
  | 'category'
  | 'moment_of_truth';

export interface RecapTimelineScene {
  id: string;
  kind: RecapSceneKind;
  startMs: number;
  endMs: number;
  durationMs: number;
  categoryId?: string;
  montageBeatIndex?: number;
}

const SECOND = 1000;

function seconds(value: number): number {
  return Math.round(value * SECOND);
}

export const CATEGORY_SCENE_DURATION_MS = seconds(9.5);
export const INTRO_MIN_DURATION_MS = seconds(4.5);
export const RECAP_EXIT_FADE_MS = 420;

const MONTAGE_SCENE_DURATION_MS = seconds(4.5);
const HEADLINE_GIRLS_DURATION_MS = seconds(4);
const PHONE_POST_BOYS_DURATION_MS = seconds(4);
const MOMENT_OF_TRUTH_DURATION_MS = seconds(6);

export function buildSeasonRecapTimeline(categoryIds: string[]): RecapTimelineScene[] {
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
    pushScene('montage_0', 'montage', MONTAGE_SCENE_DURATION_MS, { montageBeatIndex: 0 }),
    pushScene('montage_1', 'montage', MONTAGE_SCENE_DURATION_MS, { montageBeatIndex: 1 }),
    pushScene('montage_2', 'montage', MONTAGE_SCENE_DURATION_MS, { montageBeatIndex: 2 }),
    pushScene('montage_3', 'montage', MONTAGE_SCENE_DURATION_MS, { montageBeatIndex: 3 }),
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

export const SEASON_RECAP_TIMELINE = buildSeasonRecapTimeline(DEFAULT_CATEGORY_IDS);
export const TOTAL_RECAP_DURATION_MS = SEASON_RECAP_TIMELINE.at(-1)?.endMs ?? 0;
