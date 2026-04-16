import { describe, expect, it } from 'vitest';
import { buildQuickTapRaceLayout } from '../../../src/minigames/laneRacers/engine/layout';

describe('Lane Racers layout', () => {
  it('keeps every lane inside the track for larger participant counts', () => {
    for (const laneCount of [6, 12]) {
      const layout = buildQuickTapRaceLayout(960, 620, 1, laneCount);
      const lastLane = layout.lanes.at(-1);

      expect(layout.lanes).toHaveLength(laneCount);
      expect(lastLane).toBeDefined();
      expect(lastLane!.y + lastLane!.height).toBeLessThanOrEqual(layout.trackRect.y + layout.trackRect.height);
      expect(layout.lanes[0].y).toBeGreaterThanOrEqual(layout.trackRect.y);
    }
  });
});
