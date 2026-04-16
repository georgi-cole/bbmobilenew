import type { QuickTapRaceLayout, QuickTapRaceRuntimeState } from './types';

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

export function drawUiOverlays(
  ctx: CanvasRenderingContext2D,
  state: QuickTapRaceRuntimeState,
  layout: QuickTapRaceLayout,
): void {
  const countdownText =
    state.phase === 'countdown'
      ? state.countdownMs > 800
        ? String(Math.ceil(state.countdownMs / 1000))
        : 'GO'
      : null;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = `700 ${Math.round(Math.min(22, layout.headerRect.height * 0.28))}px system-ui`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Slipstream Circuit', layout.headerRect.x, layout.headerRect.y + layout.headerRect.height * 0.34);
  ctx.restore();

  const tapZone = layout.tapZoneRect;
  const tapGradient = ctx.createLinearGradient(tapZone.x, tapZone.y, tapZone.x, tapZone.y + tapZone.height);
  tapGradient.addColorStop(0, 'rgba(14,165,233,0.18)');
  tapGradient.addColorStop(1, 'rgba(59,130,246,0.08)');
  ctx.fillStyle = tapGradient;
  ctx.strokeStyle = 'rgba(96,165,250,0.32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(tapZone.x, tapZone.y, tapZone.width, tapZone.height, 26);
  } else {
    traceRoundedRect(ctx, tapZone.x, tapZone.y, tapZone.width, tapZone.height, 26);
  }
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.fillStyle = 'rgba(248,250,252,0.96)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.round(Math.min(30, tapZone.height * 0.24))}px system-ui`;
  ctx.fillText('TAP TO DRIVE', tapZone.x + tapZone.width * 0.5, tapZone.y + tapZone.height * 0.4);
  ctx.font = `600 ${Math.round(Math.min(16, tapZone.height * 0.13))}px system-ui`;
  ctx.fillStyle = 'rgba(191,219,254,0.95)';
  ctx.fillText(
    'Build momentum, trigger boosts, and slingshot into the finish',
    tapZone.x + tapZone.width * 0.5,
    tapZone.y + tapZone.height * 0.68,
  );
  ctx.restore();

  if (countdownText) {
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,23,0.38)';
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `900 ${Math.round(Math.min(72, layout.height * 0.15))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(countdownText, layout.width * 0.5, layout.height * 0.46);
    ctx.restore();
  }

  if (state.phase === 'finishAnimating') {
    ctx.save();
    ctx.fillStyle = 'rgba(2,6,23,0.14)';
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `900 ${Math.round(Math.min(42, layout.height * 0.08))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PHOTO FINISH!', layout.width * 0.5, layout.height * 0.46);
    ctx.restore();
  }
}
