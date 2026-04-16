import { getTrackX } from './trackMath';
import type { QuickTapRaceLayout, QuickTapRaceRacerState, QuickTapRaceRuntimeState } from './types';

function drawTrail(
  ctx: CanvasRenderingContext2D,
  racer: QuickTapRaceRacerState,
  layout: QuickTapRaceLayout,
  x: number,
  y: number,
): void {
  const trailLength = 56 + racer.velocity * 1300 + racer.surgeGlow * 34;
  const trail = ctx.createLinearGradient(x - trailLength, y, x + 14, y);
  trail.addColorStop(0, 'transparent');
  trail.addColorStop(0.35, `${racer.color}22`);
  trail.addColorStop(1, `${racer.color}dd`);

  ctx.save();
  ctx.globalAlpha = 0.28 + racer.surgeGlow * 0.24;
  ctx.strokeStyle = trail;
  ctx.lineWidth = 8 + racer.velocity * 120 + racer.leadPulse * 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(Math.max(layout.trackStartX, x - trailLength), y);
  ctx.lineTo(x - 10, y);
  ctx.stroke();
  ctx.restore();
}

function drawRacerBody(
  ctx: CanvasRenderingContext2D,
  racer: QuickTapRaceRacerState,
  radius: number,
): void {
  const bodyGradient = ctx.createLinearGradient(-radius * 1.4, 0, radius * 1.4, 0);
  bodyGradient.addColorStop(0, '#e2e8f0');
  bodyGradient.addColorStop(0.35, racer.isPlayer ? '#f8fafc' : racer.color);
  bodyGradient.addColorStop(1, racer.color);

  ctx.fillStyle = bodyGradient;
  ctx.beginPath();
  ctx.moveTo(-radius * 1.15, -radius * 0.72);
  ctx.quadraticCurveTo(radius * 0.12, -radius * 1.1, radius * 1.3, 0);
  ctx.quadraticCurveTo(radius * 0.12, radius * 1.1, -radius * 1.15, radius * 0.72);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = racer.isPlayer ? '#bae6fd' : 'rgba(255,255,255,0.6)';
  ctx.lineWidth = racer.isPlayer ? 2.5 : 1.8;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(radius * 0.2, 0, radius * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = racer.color;
  ctx.beginPath();
  ctx.arc(radius * 0.24, 0, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

export function drawRacers(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  state.racers.forEach((racer) => {
    const lane = layout.lanes[racer.laneIndex];
    const y = lane.centerY + racer.driftOffset;
    const x = getTrackX(layout, racer.progress);
    const radius = lane.racerRadius * (1 + racer.surgeGlow * 0.12);

    drawTrail(ctx, racer, layout, x, y);

    const aura = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2);
    aura.addColorStop(0, `${racer.color}aa`);
    aura.addColorStop(1, 'transparent');
    ctx.save();
    ctx.globalAlpha = 0.22 + racer.surgeGlow * 0.34 + racer.leadPulse * 0.16;
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y, radius * (2.1 + racer.surgeGlow * 0.9), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.min(1, racer.velocity / 0.065) - 0.2) * 0.12);
    drawRacerBody(ctx, racer, radius);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#f8fafc';
    ctx.font = `${Math.round(Math.max(11, lane.height * 0.2))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(racer.name, x, y - radius - 10);
    ctx.restore();

    if (racer.activeEffects[0]) {
      ctx.save();
      ctx.font = `${Math.round(Math.max(11, lane.height * 0.18))}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(248,250,252,0.92)';
      ctx.fillText(`${racer.activeEffects[0].icon} ${racer.activeEffects[0].shortLabel}`, x, y + radius + 8);
      ctx.restore();
    }

    if (racer.shieldCharges > 0) {
      ctx.save();
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.74;
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}
