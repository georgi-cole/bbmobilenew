import type { VaultCrackerLayout, VaultCrackerRuntimeState } from './types';
import { easeInOutSine } from '../utils/easing';

export function renderBackground(
  ctx: CanvasRenderingContext2D,
  state: VaultCrackerRuntimeState,
  layout: VaultCrackerLayout,
): void {
  const { width, height } = layout;
  const ambientDrift = 0.5 + 0.5 * Math.sin(state.idleMotion * 0.0016);
  const hazeGradient = ctx.createRadialGradient(
    layout.vaultCenterX,
    layout.vaultCenterY,
    layout.vaultRadius * 0.2,
    layout.vaultCenterX,
    layout.vaultCenterY,
    width * 0.75,
  );
  hazeGradient.addColorStop(0, `rgba(68, 154, 255, ${0.16 + ambientDrift * 0.08})`);
  hazeGradient.addColorStop(0.45, 'rgba(18, 34, 64, 0.38)');
  hazeGradient.addColorStop(1, 'rgba(1, 6, 16, 0.98)');
  ctx.fillStyle = hazeGradient;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(
    width / 2,
    height * 0.42,
    Math.min(width, height) * 0.14,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.68)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#8abaff';
  for (let index = 0; index < height; index += 4) {
    const wave = easeInOutSine(((index / height) + ambientDrift * 0.15) % 1);
    ctx.fillRect(0, index, width, 1 + wave * 0.3);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(92, 148, 255, 0.18)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 10]);
  ctx.beginPath();
  ctx.moveTo(layout.padding, layout.headerRect.y + layout.headerRect.height + 6);
  ctx.lineTo(width - layout.padding, layout.headerRect.y + layout.headerRect.height + 6);
  ctx.stroke();
  ctx.restore();
}
