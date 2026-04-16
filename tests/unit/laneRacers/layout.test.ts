import { describe, expect, it } from 'vitest';
import { buildQuickTapRaceLayout } from '../../../src/minigames/laneRacers/engine/layout';

describe('Lane Racers layout', () => {
  it('keeps every lane inside the track for larger participant counts', () => {
    const layout = buildQuickTapRaceLayout(960, 620, 1, 6);
    const lastLane = layout.lanes.at(-1);

    expect(layout.lanes).toHaveLength(6);
    expect(lastLane).toBeDefined();
    expect(lastLane!.y + lastLane!.height).toBeLessThanOrEqual(layout.trackRect.y + layout.trackRect.height);
    expect(layout.lanes[0].y).toBeGreaterThanOrEqual(layout.trackRect.y);
  });
});
