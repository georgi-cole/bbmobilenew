import type { QuickTapRaceLayout, QuickTapRaceRuntimeState } from './types';

export function drawEffects(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  state.tapBursts.forEach((burst) => {
    ctx.save();
    ctx.globalAlpha = burst.alpha;
    ctx.strokeStyle = burst.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(burst.x, burst.y, burst.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  state.pickupBursts.forEach((burst) => {
    const lane = layout.lanes[burst.laneIndex];
    const x = lane.x + 28 + burst.progress * (lane.width - 56);
    const y = lane.y + lane.height * 0.5;
    const age = 1 - burst.lifeMs / burst.maxLifeMs;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = burst.color;
    ctx.font = `${Math.round(20 + age * 10)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(burst.icon, x, y - age * 22);
    ctx.restore();
  });

  if (state.finishFlash > 0.01) {
    ctx.save();
    ctx.globalAlpha = state.finishFlash * 0.26;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.restore();
  }
}
