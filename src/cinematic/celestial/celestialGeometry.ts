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
    lerp(moonY, 15, state.sunPositionProgress),
    lerp(-540, -760, state.sunPositionProgress),
  ];
};
