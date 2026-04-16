import type { QuickTapRaceLayout, QuickTapRaceRuntimeState } from './types';

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, layout.height);
  gradient.addColorStop(0, '#05111f');
  gradient.addColorStop(0.46, '#081f36');
  gradient.addColorStop(1, '#160d24');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, layout.width, layout.height);

  const ambientAlpha = 0.08 + state.screenPulse * 0.05;
  ctx.save();
  ctx.globalAlpha = ambientAlpha;
  for (let i = 0; i < 3; i++) {
    const x = layout.width * (0.15 + i * 0.32);
    const y = layout.height * (0.18 + i * 0.22);
    const radius = layout.width * (0.25 + i * 0.03);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, i === 1 ? '#7c3aed' : '#0ea5e9');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
