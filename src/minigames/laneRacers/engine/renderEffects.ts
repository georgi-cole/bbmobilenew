import { getLaneCenterY, getTrackX } from './trackMath';
import type { QuickTapRaceLayout, QuickTapRaceRuntimeState } from './types';

export function drawEffects(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  state.tapBursts.forEach((burst) => {
    const x = burst.x ?? (burst.progress !== undefined ? getTrackX(layout, burst.progress) : layout.trackRect.x + layout.trackRect.width * 0.5);
    const y = burst.y ?? (burst.laneIndex !== undefined ? getLaneCenterY(layout, burst.laneIndex) : layout.trackRect.y + layout.trackRect.height * 0.5);

    ctx.save();
    ctx.globalAlpha = burst.alpha;
    ctx.strokeStyle = burst.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, burst.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  state.pickupBursts.forEach((burst) => {
    const x = getTrackX(layout, burst.progress);
    const y = getLaneCenterY(layout, burst.laneIndex);
    const age = 1 - burst.lifeMs / burst.maxLifeMs;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = burst.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 18 + age * 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = burst.color;
    ctx.font = `${Math.round(18 + age * 10)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(burst.icon, x, y - age * 18);
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
