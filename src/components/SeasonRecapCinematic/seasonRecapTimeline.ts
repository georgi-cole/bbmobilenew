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

function buildScene(
  id: string,
  kind: RecapSceneKind,
  startSeconds: number,
  endSeconds: number,
  extra: Partial<RecapTimelineScene> = {},
): RecapTimelineScene {
  return {
    id,
    kind,
    startMs: seconds(startSeconds),
    endMs: seconds(endSeconds),
    durationMs: seconds(endSeconds - startSeconds),
    ...extra,
  };
}

export const CATEGORY_SCENE_DURATION_MS = seconds(8);
export const TABLOID_CARD_DURATION_MS = seconds(3.5);
export const INTRO_MIN_DURATION_MS = seconds(2.5);
export const HANDOFF_END_BUFFER_MS = seconds(2);
export const RECAP_EXIT_FADE_MS = 420;

export function buildSeasonRecapTimeline(categoryIds: string[], evictionWaveCount: number): RecapTimelineScene[] {
  const safeWaveCount = Math.max(evictionWaveCount, 1);
  const waveDurationSeconds = 8 / safeWaveCount;

  const timeline: RecapTimelineScene[] = [
    // ACT 1 — THE VOTES ARE LOCKED (0.0s–14.0s)
    buildScene('intro_votes_in', 'intro', 0.0, 4.0),
    buildScene('intro_verdict_locked', 'intro', 4.0, 7.2),
    buildScene('intro_before_final_word', 'intro', 7.2, 10.5),
    buildScene('intro_rewind_chaos', 'intro', 10.5, 14.0),

    // ACT 2 — SEASON PULSE MONTAGE (14.0s–30.0s)
    buildScene('montage_0', 'montage', 14.0, 18.0, { montageBeatIndex: 0 }),
    buildScene('montage_1', 'montage', 18.0, 22.0, { montageBeatIndex: 1 }),
    buildScene('montage_2', 'montage', 22.0, 26.0, { montageBeatIndex: 2 }),
    buildScene('montage_3', 'montage', 26.0, 30.0, { montageBeatIndex: 3 }),

    // ACT 3 — TABLOID INTERLUDE (30.0s–48.0s)
    buildScene('tabloid_0', 'tabloid', 30.0, 33.5, { tabloidCardIndex: 0 }),
    buildScene('tabloid_1', 'tabloid', 33.5, 37.0, { tabloidCardIndex: 1 }),
    buildScene('tabloid_2', 'tabloid', 37.0, 40.5, { tabloidCardIndex: 2 }),
    buildScene('tabloid_3', 'tabloid', 40.5, 44.0, { tabloidCardIndex: 3 }),
    buildScene('tabloid_4', 'tabloid', 44.0, 48.0, { tabloidCardIndex: 4 }),
  ];

  // ACT 4 — CATEGORY AWARDS (48.0s–96.0s)
  categoryIds.forEach((categoryId, index) => {
    const startSeconds = 48 + index * 8;
    timeline.push(
      buildScene(`category_${categoryId}`, 'category', startSeconds, startSeconds + 8, {
        categoryId,
      }),
    );
  });

  // ACT 5 — ROAD TO THE FINALISTS / EVICTION LADDER (96.0s–112.0s)
  timeline.push(buildScene('ladder_intro', 'ladder_intro', 96.0, 98.5));
  for (let index = 0; index < safeWaveCount; index += 1) {
    const startSeconds = 98.5 + index * waveDurationSeconds;
    timeline.push(
      buildScene(`ladder_wave_${index}`, 'ladder_wave', startSeconds, startSeconds + waveDurationSeconds, {
        ladderWaveIndex: index,
      }),
    );
  }
  timeline.push(buildScene('ladder_finalists', 'ladder_finalists', 106.5, 112.0));

  // ACT 6 — FINAL HANDOFF (112.0s–120.0s)
  timeline.push(
    buildScene('handoff_and_now', 'handoff', 112.0, 114.8, { handoffVariant: 'and_now' }),
    buildScene('handoff_final_verdict', 'handoff', 114.8, 118.0, {
      handoffVariant: 'final_verdict',
    }),
    buildScene('handoff_fade_out', 'handoff', 118.0, 120.0, { handoffVariant: 'fade_out' }),
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
