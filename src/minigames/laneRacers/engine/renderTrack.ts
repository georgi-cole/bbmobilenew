import { getPickupVisual } from './effects';
import type { QuickTapRaceLayout, QuickTapRaceRuntimeState } from './types';

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  const finishX = layout.trackRect.x + layout.trackRect.width - 28;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.fillRect(layout.trackRect.x, layout.trackRect.y, layout.trackRect.width, layout.trackRect.height);
  ctx.restore();

  layout.lanes.forEach((lane, index) => {
    const laneGlow = state.racers[index]?.leadPulse ?? 0;
    const laneGradient = ctx.createLinearGradient(lane.x, lane.y, lane.x + lane.width, lane.y);
    laneGradient.addColorStop(0, 'rgba(255,255,255,0.08)');
    laneGradient.addColorStop(0.55, 'rgba(56,189,248,0.12)');
    laneGradient.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = laneGradient;
    ctx.fillRect(lane.x, lane.y, lane.width, lane.height);

    ctx.strokeStyle = `rgba(255,255,255,${0.09 + laneGlow * 0.14})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(lane.x + 0.5, lane.y + 0.5, lane.width - 1, lane.height - 1);

    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.setLineDash([10, 14]);
    ctx.beginPath();
    ctx.moveTo(lane.x + 18, lane.y + lane.height * 0.5);
    ctx.lineTo(finishX - 18, lane.y + lane.height * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  ctx.save();
  ctx.fillStyle = 'rgba(248, 250, 252, 0.84)';
  ctx.fillRect(finishX, layout.trackRect.y - 2, 6, layout.trackRect.height + 4);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 2; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#0f172a' : '#e2e8f0';
      ctx.fillRect(finishX + col * 10, layout.trackRect.y + row * (layout.trackRect.height / 10), 10, layout.trackRect.height / 10);
    }
  }
  ctx.restore();

  state.racers.forEach((racer) => {
    const lane = layout.lanes[racer.laneIndex];
    racer.pickups.forEach((pickup) => {
      if (pickup.triggered) return;
      const centerX = lane.x + pickup.progress * (lane.width - 56) + 28;
      const centerY = lane.y + lane.height * 0.5;
      const visual = getPickupVisual(pickup.type, pickup.effectId);
      const pulse = 1 + Math.sin((state.elapsedMs + pickup.progress * 1000) / 180) * 0.06;
      const size = lane.racerRadius * 1.25 * pulse;

      ctx.save();
      ctx.globalAlpha = 0.85 + pickup.flash * 0.15;
      ctx.fillStyle = `${visual.color}22`;
      ctx.strokeStyle = visual.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = `${Math.round(size)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(visual.icon, centerX, centerY + 1);
      ctx.restore();
    });
  });
}
