export function easeOutCubic(t: number): number {
  const x = 1 - t;
  return 1 - x * x * x;
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}
