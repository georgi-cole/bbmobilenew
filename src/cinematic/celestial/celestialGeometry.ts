import type { TimelineState } from '../timeline/timeline';
import { lerp } from '../utils/math';

export const CELESTIAL_DISC_RADIUS = 12;
export const CELESTIAL_EYE_SCALE = 0.92;
export const CELESTIAL_PUPIL_RADIUS = CELESTIAL_DISC_RADIUS / CELESTIAL_EYE_SCALE;

export const getCelestialBreath = (frame: number): number =>
  1 + Math.sin(frame * 0.026) * 0.008;

export const getCelestialEyePosition = (state: TimelineState): readonly [number, number] => {
  const moonY = lerp(-42, 138, state.moonProgress);
  return [
    // Preserve the existing eye/iris movement, but make their shared authored
    // landing point the real coastal horizon instead of the temporary
    // in-water position. Both visual layers already consume this helper, so
    // they remain coupled throughout the move and morph.
    lerp(moonY, 7.5, state.sunPositionProgress),
    lerp(-540, -1135, state.sunPositionProgress),
  ];
};
