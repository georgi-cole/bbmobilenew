import type { QuickTapRaceLayout, QuickTapRaceRacerState, QuickTapRaceRuntimeState } from './types';

function drawTrail(
  ctx: CanvasRenderingContext2D,
  racer: QuickTapRaceRacerState,
  laneStartX: number,
  centerY: number,
  x: number,
): void {
  const trail = ctx.createLinearGradient(laneStartX, centerY, x, centerY);
  trail.addColorStop(0, 'transparent');
  trail.addColorStop(1, `${racer.color}cc`);
  ctx.save();
  ctx.globalAlpha = 0.28 + racer.surgeGlow * 0.25;
  ctx.strokeStyle = trail;
  ctx.lineWidth = 10 + racer.leadPulse * 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(Math.max(laneStartX, x - 80), centerY);
  ctx.lineTo(x - 10, centerY);
  ctx.stroke();
  ctx.restore();
}

export function drawRacers(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  state.racers.forEach((racer) => {
    const lane = layout.lanes[racer.laneIndex];
    const centerY = lane.y + lane.height * 0.5 + Math.sin(racer.bobPhase) * 2.5;
    const x = lane.x + 28 + racer.progress * (lane.width - 56);

    drawTrail(ctx, racer, lane.x + 18, centerY, x);

    const aura = ctx.createRadialGradient(x, centerY, 0, x, centerY, lane.racerRadius * 2.8);
    aura.addColorStop(0, `${racer.color}aa`);
    aura.addColorStop(1, 'transparent');
    ctx.save();
    ctx.globalAlpha = 0.34 + racer.surgeGlow * 0.3;
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, centerY, lane.racerRadius * (2.2 + racer.surgeGlow * 0.7), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = racer.isPlayer ? '#f8fafc' : racer.color;
    ctx.beginPath();
    ctx.arc(x, centerY, lane.racerRadius * (racer.isPlayer ? 1.1 : 1), 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = racer.isPlayer ? 3 : 2;
    ctx.strokeStyle = racer.isPlayer ? racer.color : 'rgba(255,255,255,0.6)';
    ctx.stroke();

    ctx.fillStyle = racer.isPlayer ? racer.color : '#020617';
    ctx.beginPath();
    ctx.arc(x, centerY, lane.racerRadius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#f8fafc';
    ctx.font = `${Math.round(Math.max(11, lane.height * 0.24))}px system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(racer.name, lane.x + 12, lane.y + 14);
    ctx.restore();

    if (racer.activeEffects[0]) {
      ctx.save();
      ctx.font = `${Math.round(Math.max(11, lane.height * 0.22))}px system-ui`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(248,250,252,0.92)';
      ctx.fillText(
        `${racer.activeEffects[0].icon} ${racer.activeEffects[0].shortLabel}`,
        lane.x + lane.width - 8,
        lane.y + 14,
      );
      ctx.restore();
    }

    if (racer.shieldCharges > 0) {
      ctx.save();
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(x, centerY, lane.racerRadius * 1.45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}
