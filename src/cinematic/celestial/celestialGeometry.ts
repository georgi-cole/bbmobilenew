import type { TimelineState } from '../timeline/timeline';
import { lerp } from '../utils/math';

export const CELESTIAL_DISC_RADIUS = 12;
export const CELESTIAL_EYE_SCALE = 0.92;
export const CELESTIAL_PUPIL_RADIUS = CELESTIAL_DISC_RADIUS / CELESTIAL_EYE_SCALE;
export const CELESTIAL_SUN_X = 22;
export const CELESTIAL_SUN_Y = 7.5;
export const CELESTIAL_SUN_Z = -1135;

export const getCelestialBreath = (frame: number): number =>
  1 + Math.sin(frame * 0.026) * 0.008;

export const getCelestialEyePosition = (state: TimelineState): readonly [number, number] => {
  const moonY = lerp(-42, 138, state.moonProgress);
  return [
    lerp(moonY, 15, state.sunPositionProgress),
    lerp(-540, -760, state.sunPositionProgress),
  ];
};

/**
 * Shared world-space position for the iris/sun body and the surrounding eye
 * geometry. Keeping this handoff in one function prevents the two visual
 * layers from drifting apart while the eye becomes the coastal sun.
 */
export const getCelestialHandoffPosition = (
  state: TimelineState,
): readonly [number, number, number] => {
  const [eyeY, eyeZ] = getCelestialEyePosition(state);
  const handoff = state.sunHorizonProgress;

  return [
    lerp(0, CELESTIAL_SUN_X, handoff),
    lerp(eyeY, CELESTIAL_SUN_Y, handoff) - state.sunsetProgress * 34,
    lerp(eyeZ, CELESTIAL_SUN_Z, handoff),
  ];
};
