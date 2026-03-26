export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const MAX_RGB_DIST = Math.sqrt(255 * 255 * 3);
export const HINT_PENALTY_POINTS = 5;

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function rgbDist(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function calculateColorMatchAccuracy(target: RGB, player: RGB): number {
  return Math.max(0, 100 - (rgbDist(target, player) / MAX_RGB_DIST) * 100);
}

export function randomStartColor(target: RGB, rng: () => number): RGB {
  function offsetChannel(v: number): number {
    const delta = 40 + Math.floor(rng() * 80);
    const sign = rng() < 0.5 ? 1 : -1;
    return Math.min(255, Math.max(0, v + sign * delta));
  }

  return {
    r: offsetChannel(target.r),
    g: offsetChannel(target.g),
    b: offsetChannel(target.b),
  };
}

export function seededPick<T>(arr: T[], count: number, rng: () => number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function channelHint(channel: 'r' | 'g' | 'b', target: number, current: number): string {
  const label = channel === 'r' ? 'red' : channel === 'g' ? 'green' : 'blue';
  const delta = target - current;
  const deltaPct = Math.round((Math.abs(delta) / 255) * 100);
  if (deltaPct <= 2) return `${label} level is accurate`;
  return `${delta > 0 ? 'increase' : 'decrease'} ${label} by ${deltaPct}%`;
}

export function buildHintMessage(target: RGB, current: RGB): string {
  return [
    channelHint('r', target.r, current.r),
    channelHint('g', target.g, current.g),
    channelHint('b', target.b, current.b),
  ].join(' • ');
}

export function applyHintPenalty(rawAverage: number, hintsUsed: number): number {
  return Math.max(0, Math.round(rawAverage - hintsUsed * HINT_PENALTY_POINTS));
}
