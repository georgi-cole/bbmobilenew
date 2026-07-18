export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

export const invLerp = (from: number, to: number, value: number): number =>
  clamp01((value - from) / Math.max(0.00001, to - from));

export const smoothstep = (value: number): number => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export const smootherstep = (value: number): number => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export const rangeProgress = (frame: number, from: number, to: number): number =>
  clamp01((frame - from) / Math.max(1, to - from));

export const easedRange = (frame: number, from: number, to: number): number =>
  smootherstep(rangeProgress(frame, from, to));

export const pulse = (frame: number, centre: number, radius: number): number => {
  const distance = Math.abs(frame - centre) / radius;
  return distance >= 1 ? 0 : Math.pow(1 - distance, 3);
};

/**
 * Keeps the middle of a path linear while easing only the first and last few
 * percent. The output is normalized by distance so getPointAt() stays close to
 * a constant world-space speed through the main flight.
 */
export const easePathEnds = (value: number, edge = 0.07): number => {
  const t = clamp01(value);
  const normalizer = 1 - edge;
  if (t < edge) return (t * t) / (2 * edge * normalizer);
  if (t > 1 - edge) {
    const remaining = 1 - t;
    return 1 - (remaining * remaining) / (2 * edge * normalizer);
  }
  return (t - edge / 2) / normalizer;
};
