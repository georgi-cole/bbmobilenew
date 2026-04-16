import type { VaultCrackerLayout, VaultCrackerRuntimeState } from './types';
import { clamp } from '../utils/math';

export function renderEffects(
  ctx: CanvasRenderingContext2D,
  state: VaultCrackerRuntimeState,
  layout: VaultCrackerLayout,
): void {
  const flash = clamp(state.rejectPulse * 0.25 + state.successPulse * 0.34, 0, 0.36);
  if (flash > 0) {
    const hue = state.successPulse > state.rejectPulse ? 152 : 5;
    ctx.save();
    ctx.fillStyle = `hsla(${hue}, 88%, 62%, ${flash})`;
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.restore();
  }

  ctx.save();
  ctx.translate(state.shake * 8 * Math.sin(state.idleMotion * 0.026), state.shake * 5 * Math.cos(state.idleMotion * 0.031));
  state.particles.forEach((particle) => {
    const alpha = (particle.lifeMs / particle.maxLifeMs) * particle.alpha;
    ctx.fillStyle = `hsla(${particle.hue}, 95%, 64%, ${alpha})`;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#d7ebff';
  for (let index = 0; index < layout.height; index += 6) {
    ctx.fillRect(0, index + ((state.idleMotion * 0.02) % 6), layout.width, 1);
  }
  ctx.restore();
}
