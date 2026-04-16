import { getPickupVisual } from './effects';
import { getLaneCenterY, getTrackX } from './trackMath';
import type { QuickTapRaceLayout, QuickTapRaceRuntimeState } from './types';

function drawTrackShell(
  ctx: CanvasRenderingContext2D,
  layout: QuickTapRaceLayout,
  tension: number,
): void {
  const { trackRect } = layout;
  const shell = ctx.createLinearGradient(trackRect.x, trackRect.y, trackRect.x + trackRect.width, trackRect.y + trackRect.height);
  shell.addColorStop(0, 'rgba(15, 23, 42, 0.92)');
  shell.addColorStop(0.5, 'rgba(30, 41, 59, 0.88)');
  shell.addColorStop(1, 'rgba(61, 32, 20, 0.82)');
  ctx.fillStyle = shell;
  ctx.fillRect(trackRect.x, trackRect.y, trackRect.width, trackRect.height);

  ctx.strokeStyle = `rgba(148, 163, 184, ${0.22 + tension * 0.2})`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(trackRect.x + 0.5, trackRect.y + 0.5, trackRect.width - 1, trackRect.height - 1);
}

function drawSpeedMarks(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  const span = layout.trackFinishX - layout.trackStartX;
  const scroll = (state.elapsedMs * 0.18) % 72;
  for (let index = -2; index < 14; index += 1) {
    const x = layout.trackStartX + ((index * 72 + scroll) % (span + 72));
    ctx.beginPath();
    ctx.moveTo(x, layout.trackRect.y + 10);
    ctx.lineTo(x - 22, layout.trackRect.y + layout.trackRect.height - 10);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  const leaderProgress = Math.max(...state.racers.map((racer) => racer.progress), 0);
  drawTrackShell(ctx, layout, state.tension);
  drawSpeedMarks(ctx, state, layout);

  layout.lanes.forEach((lane, index) => {
    const guideAlpha = 0.14 + (state.racers[index]?.leadPulse ?? 0) * 0.22;
    const y = lane.centerY;
    const glow = ctx.createLinearGradient(layout.trackStartX, y, layout.trackFinishX, y);
    glow.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
    glow.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)');
    glow.addColorStop(1, 'rgba(248, 113, 113, 0.12)');

    ctx.save();
    ctx.strokeStyle = glow;
    ctx.globalAlpha = guideAlpha;
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 18]);
    ctx.beginPath();
    ctx.moveTo(layout.trackStartX, y);
    ctx.lineTo(layout.trackFinishX, y);
    ctx.stroke();
    ctx.restore();
  });

  ctx.save();
  ctx.globalAlpha = 0.35 + leaderProgress * 0.4;
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(layout.trackStartX, layout.trackRect.y + 6);
  ctx.lineTo(layout.trackStartX, layout.trackRect.y + layout.trackRect.height - 6);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(248, 250, 252, 0.94)';
  ctx.fillRect(layout.trackFinishX - 4, layout.trackRect.y - 4, 8, layout.trackRect.height + 8);
  const checkerHeight = Math.max(18, layout.trackRect.height / 10);
  for (let row = 0; row < Math.ceil(layout.trackRect.height / checkerHeight); row += 1) {
    for (let col = 0; col < 2; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#0f172a' : '#f8fafc';
      ctx.fillRect(
        layout.trackFinishX + col * 10 - 10,
        layout.trackRect.y + row * checkerHeight,
        10,
        Math.min(checkerHeight, layout.trackRect.y + layout.trackRect.height - (layout.trackRect.y + row * checkerHeight)),
      );
    }
  }
  ctx.restore();

  if (leaderProgress > 0.78) {
    ctx.save();
    const finishGlow = ctx.createLinearGradient(layout.trackFinishX - 90, 0, layout.trackFinishX + 12, 0);
    finishGlow.addColorStop(0, 'transparent');
    finishGlow.addColorStop(1, 'rgba(248, 113, 113, 0.22)');
    ctx.fillStyle = finishGlow;
    ctx.fillRect(layout.trackFinishX - 90, layout.trackRect.y - 8, 102, layout.trackRect.height + 16);
    ctx.restore();
  }

  state.racers.forEach((racer) => {
    racer.pickups.forEach((pickup) => {
      if (pickup.triggered) return;
      const x = getTrackX(layout, pickup.progress);
      const baseY = getLaneCenterY(layout, racer.laneIndex);
      const floatOffset = Math.sin((state.elapsedMs + pickup.progress * 900) / 180) * 6;
      const y = baseY - 18 + floatOffset;
      const visual = getPickupVisual(pickup.type, pickup.effectId);
      const pulse = 1 + Math.sin((state.elapsedMs + pickup.progress * 1100) / 170) * 0.08;
      const size = layout.lanes[racer.laneIndex]?.racerRadius ?? 16;
      const radius = size * 1.05 * pulse;

      ctx.save();
      ctx.globalAlpha = 0.78 + pickup.flash * 0.18;
      ctx.fillStyle = `${visual.color}22`;
      ctx.strokeStyle = visual.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = `${Math.round(radius * 1.25)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(visual.icon, x, y + 1);
      ctx.restore();
    });
  });
}
