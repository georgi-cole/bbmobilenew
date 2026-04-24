import { describe, expect, it } from 'vitest';
import { getGame } from '../../src/minigames/registry';
import reactComponents from '../../src/minigames/reactComponents';

describe('Lane Racers registry wiring', () => {
  it('registers Lane Racers as a React minigame', () => {
    const entry = getGame('laneRacers');
    expect(entry).toBeDefined();
    expect(entry?.implementation).toBe('react');
    expect(entry?.reactComponentKey).toBe('LaneRacers');
    expect(entry?.authoritative).toBe(false);
    expect(entry?.scoringAdapter).toBe('raw');
    expect(entry?.timeLimitMs).toBe(60_000);
    expect(entry?.instructions.length).toBeGreaterThan(0);
    expect(entry?.retired).toBe(true);
  });

  it('maps the react component key to the Lane Racers component', () => {
    expect(reactComponents.LaneRacers).toBeTypeOf('function');
  });
});
