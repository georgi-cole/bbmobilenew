import type { QuickTapRaceLayout, QuickTapRaceRuntimeState } from './types';

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  const gradient = ctx.createLinearGradient(0, 0, layout.width, layout.height);
  gradient.addColorStop(0, '#030712');
  gradient.addColorStop(0.45, '#08162b');
  gradient.addColorStop(1, '#1a1027');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, layout.width, layout.height);

  const ambientAlpha = 0.1 + state.screenPulse * 0.05 + state.tension * 0.08;
  ctx.save();
  ctx.globalAlpha = ambientAlpha;
  for (let i = 0; i < 4; i += 1) {
    const x = layout.width * (0.12 + i * 0.24);
    const y = layout.height * (0.14 + (i % 2) * 0.22);
    const radius = layout.width * (0.2 + i * 0.025);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, i % 2 === 0 ? '#0ea5e9' : '#7c3aed');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.12 + state.tension * 0.08;
  ctx.strokeStyle = 'rgba(191, 219, 254, 0.7)';
  ctx.lineWidth = 1.5;
  const streakCount = 14;
  for (let index = 0; index < streakCount; index += 1) {
    const ratio = index / streakCount;
    const y = layout.trackRect.y - 18 + ratio * (layout.trackRect.height + 36);
    const phase = (state.elapsedMs * 0.18 + index * 43) % (layout.width + 240);
    const startX = layout.width - phase;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + 90 + state.tension * 40, y);
    ctx.stroke();
  }
  ctx.restore();
}
