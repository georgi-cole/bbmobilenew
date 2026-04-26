export type RecapSceneKind =
  | 'intro'
  | 'montage'
  | 'tabloid'
  | 'category'
  | 'ladder_intro'
  | 'ladder_wave'
  | 'ladder_finalists'
  | 'handoff';

export interface RecapTimelineScene {
  id: string;
  kind: RecapSceneKind;
  startMs: number;
  endMs: number;
  durationMs: number;
  categoryId?: string;
  montageBeatIndex?: number;
  tabloidCardIndex?: number;
  ladderWaveIndex?: number;
  handoffVariant?: 'and_now' | 'final_verdict' | 'fade_out';
}

const SECOND = 1000;

function seconds(value: number): number {
  return Math.round(value * SECOND);
}

export const CATEGORY_SCENE_DURATION_MS = seconds(9.5);
export const TABLOID_CARD_DURATION_MS = seconds(5);
export const INTRO_MIN_DURATION_MS = seconds(4.5);
export const HANDOFF_END_BUFFER_MS = seconds(2.5);
export const RECAP_EXIT_FADE_MS = 420;

const MONTAGE_SCENE_DURATION_MS = seconds(4.5);
const LADDER_INTRO_DURATION_MS = seconds(3.5);
const LADDER_WAVE_DURATION_MS = seconds(4.25);
const LADDER_FINALISTS_DURATION_MS = seconds(7);
const HANDOFF_AND_NOW_DURATION_MS = seconds(3.5);
const HANDOFF_FINAL_VERDICT_DURATION_MS = seconds(4);

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
    pushScene('montage_0', 'montage', MONTAGE_SCENE_DURATION_MS, { montageBeatIndex: 0 }),
    pushScene('montage_1', 'montage', MONTAGE_SCENE_DURATION_MS, { montageBeatIndex: 1 }),
    pushScene('montage_2', 'montage', MONTAGE_SCENE_DURATION_MS, { montageBeatIndex: 2 }),
    pushScene('montage_3', 'montage', MONTAGE_SCENE_DURATION_MS, { montageBeatIndex: 3 }),
    pushScene('tabloid_0', 'tabloid', TABLOID_CARD_DURATION_MS, { tabloidCardIndex: 0 }),
    pushScene('tabloid_1', 'tabloid', TABLOID_CARD_DURATION_MS, { tabloidCardIndex: 1 }),
    pushScene('tabloid_2', 'tabloid', TABLOID_CARD_DURATION_MS, { tabloidCardIndex: 2 }),
    pushScene('tabloid_3', 'tabloid', TABLOID_CARD_DURATION_MS, { tabloidCardIndex: 3 }),
    pushScene('tabloid_4', 'tabloid', TABLOID_CARD_DURATION_MS, { tabloidCardIndex: 4 }),
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
  timeline.push(pushScene('ladder_finalists', 'ladder_finalists', LADDER_FINALISTS_DURATION_MS));

  timeline.push(
    pushScene('handoff_and_now', 'handoff', HANDOFF_AND_NOW_DURATION_MS, { handoffVariant: 'and_now' }),
    pushScene('handoff_final_verdict', 'handoff', HANDOFF_FINAL_VERDICT_DURATION_MS, {
      handoffVariant: 'final_verdict',
    }),
    pushScene('handoff_fade_out', 'handoff', HANDOFF_END_BUFFER_MS, { handoffVariant: 'fade_out' }),
  );

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
