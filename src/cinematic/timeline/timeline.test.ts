import { describe, expect, it } from 'vitest';
import { CINEMATIC_CONFIG } from '../config/cinematicConfig';
import { getTimelineState } from './timeline';

const authoredToOutputFrame = (authoredFrame: number): number =>
  (authoredFrame / 1799) * (CINEMATIC_CONFIG.durationInFrames - 1);

describe('cinematic timeline handoffs', () => {
  it('keeps sunlight hidden while the aperture is closed', () => {
    const hiddenSun = getTimelineState(authoredToOutputFrame(1400));

    expect(hiddenSun.apertureClosure).toBeGreaterThan(0.99);
    expect(hiddenSun.sunMorph).toBeGreaterThan(0.99);
    expect(hiddenSun.sunRevealProgress).toBe(0);
    expect(hiddenSun.sunIntensity).toBe(0);
  });

  it('anchors the sun to the horizon before the yacht camera inspection', () => {
    const revealEnd = getTimelineState(authoredToOutputFrame(1545));
    const yachtFocusStart = getTimelineState(authoredToOutputFrame(1586));

    expect(revealEnd.sunRevealProgress).toBeGreaterThan(0.99);
    expect(revealEnd.sunHorizonProgress).toBeGreaterThan(0.99);
    expect(yachtFocusStart.sunHorizonProgress).toBe(1);
  });

  it('never leaves a gap between the city and the opaque coast', () => {
    for (let authoredFrame = 1540; authoredFrame <= 1600; authoredFrame += 2) {
      const state = getTimelineState(authoredToOutputFrame(authoredFrame));
      const cityStillCoversFrame = state.cityExitProgress < 0.995;
      const coastCoversFrame = state.coastProgress > 0.12;

      expect(cityStillCoversFrame || coastCoversFrame).toBe(true);
    }
  });

  it('holds a multi-second graded sunset before final darkness', () => {
    const sunsetStart = getTimelineState(authoredToOutputFrame(1672));
    const sunsetMiddle = getTimelineState(authoredToOutputFrame(1730));
    const sunsetEnd = getTimelineState(authoredToOutputFrame(1786));

    expect(sunsetStart.sunsetProgress).toBe(0);
    expect(sunsetMiddle.sunsetProgress).toBeGreaterThan(0.35);
    expect(sunsetMiddle.sunsetProgress).toBeLessThan(0.7);
    expect(sunsetMiddle.fadeToDark).toBe(0);
    expect(sunsetEnd.sunsetProgress).toBe(1);
    expect(sunsetEnd.fadeToDark).toBeGreaterThan(0.6);
  });
});
