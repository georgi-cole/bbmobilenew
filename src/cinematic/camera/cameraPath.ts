import { CatmullRomCurve3, Vector3 } from 'three';
import { CINEMATIC_CONFIG } from '../config/cinematicConfig';
import { clamp01, easePathEnds, easedRange, lerp, smootherstep } from '../utils/math';

const toVector3 = (point: readonly [number, number, number]): Vector3 =>
  new Vector3(point[0], point[1], point[2]);

export const cameraCurve = new CatmullRomCurve3(
  CINEMATIC_CONFIG.camera.positionPoints.map(toVector3),
  false,
  'catmullrom',
  0.36,
);

export const lookAtCurve = new CatmullRomCurve3(
  CINEMATIC_CONFIG.camera.lookAtPoints.map(toVector3),
  false,
  'catmullrom',
  0.3,
);

export type CameraSample = {
  position: Vector3;
  target: Vector3;
  tangent: Vector3;
  bank: number;
  fov: number;
};

const mapNarrativeProgress = (progress: number): number => {
  const t = clamp01(progress);
  if (t < 0.52) return easePathEnds(t / 0.52, 0.08) * 0.63;
  if (t < 0.82) return 0.63 + smootherstep((t - 0.52) / 0.3) * 0.1;
  return 0.73 + easePathEnds((t - 0.82) / 0.18, 0.1) * 0.27;
};

export const sampleCamera = (progress: number, frame: number): CameraSample => {
  const pathProgress = mapNarrativeProgress(progress);
  const position = cameraCurve.getPointAt(pathProgress);
  const target = lookAtCurve.getPointAt(pathProgress);
  const tangent = cameraCurve.getTangentAt(pathProgress).normalize();
  const ahead = cameraCurve.getTangentAt(Math.min(1, pathProgress + 0.012)).normalize();
  const turn = tangent.clone().cross(ahead).y;

  // Briefly inspect the KoleQuant yacht, then release back to the coast-wide
  // path so the sunset can complete over the landscape.
  const focusIn = easedRange(frame, 1586, 1620);
  const focusOut = 1 - easedRange(frame, 1640, 1678);
  const yachtFocus = focusIn * focusOut;
  const focusPosition = new Vector3(38, 19, -504);
  const focusTarget = new Vector3(42, 5, -558);
  position.lerp(focusPosition, yachtFocus);
  target.lerp(focusTarget, yachtFocus);

  return {
    position,
    target,
    tangent,
    bank: Math.max(-0.055, Math.min(0.055, turn * 2.4)) * (1 - yachtFocus),
    fov: lerp(CINEMATIC_CONFIG.camera.fov, 34, yachtFocus),
  };
};
