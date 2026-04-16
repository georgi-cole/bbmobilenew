import type { VaultCrackerLayout, VaultCrackerRuntimeState } from './types';
import { clamp } from '../utils/math';

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
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
  ctx.fill();
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function renderIndicators(
  ctx: CanvasRenderingContext2D,
  state: VaultCrackerRuntimeState,
  layout: VaultCrackerLayout,
): void {
  const tension = clamp(state.elapsedMs / 90_000 + state.bestBulls * 0.1, 0, 1);
  const pressure = state.pressure;

  ctx.save();
  ctx.strokeStyle = 'rgba(59, 94, 140, 0.5)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(layout.vaultCenterX, layout.vaultCenterY, layout.pressureRadius, Math.PI * 0.78, Math.PI * 2.22);
  ctx.stroke();

  ctx.strokeStyle = `rgba(110, 243, 206, ${0.55 + tension * 0.25})`;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(
    layout.vaultCenterX,
    layout.vaultCenterY,
    layout.pressureRadius,
    Math.PI * 0.78,
    Math.PI * (0.78 + 1.44 * clamp(pressure, 0.06, 1.02)),
  );
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#9cc3f4';
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  ctx.fillText('ATTEMPTS', layout.headerRect.x, layout.headerRect.y + 4);
  ctx.fillText('ELAPSED', layout.headerRect.x + layout.headerRect.width - 88, layout.headerRect.y + 4);
  ctx.fillStyle = '#eff8ff';
  ctx.font = '800 28px Inter, system-ui, sans-serif';
  ctx.fillText(String(state.guessHistory.length).padStart(2, '0'), layout.headerRect.x, layout.headerRect.y + 22);
  ctx.textAlign = 'right';
  ctx.fillText(formatElapsed(state.elapsedMs), layout.headerRect.x + layout.headerRect.width, layout.headerRect.y + 22);
  ctx.restore();

  const submitGlow = state.submitPressed ? 0.9 : state.pulse;
  ctx.save();
  ctx.fillStyle = `rgba(8, 32, 56, ${0.88 - submitGlow * 0.08})`;
  fillRoundedRect(
    ctx,
    layout.submitRect.x,
    layout.submitRect.y,
    layout.submitRect.width,
    layout.submitRect.height,
    18,
  );
  ctx.strokeStyle = `rgba(106, 212, 255, ${0.28 + submitGlow * 0.38})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(
    layout.submitRect.x + 1,
    layout.submitRect.y + 1,
    layout.submitRect.width - 2,
    layout.submitRect.height - 2,
  );
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#eef9ff';
  ctx.font = '700 16px Inter, system-ui, sans-serif';
  ctx.fillText('TEST COMBINATION', layout.submitRect.x + layout.submitRect.width / 2, layout.submitRect.y + layout.submitRect.height / 2);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(3, 11, 20, 0.82)';
  fillRoundedRect(
    ctx,
    layout.historyRect.x,
    layout.historyRect.y,
    layout.historyRect.width,
    layout.historyRect.height,
    20,
  );
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(140, 178, 224, 0.92)';
  ctx.font = '700 12px Inter, system-ui, sans-serif';
  ctx.fillText('ATTEMPT HISTORY', layout.historyRect.x + 16, layout.historyRect.y + 12);

  const rowHeight = 14;
  const maxRows = Math.max(1, Math.floor((layout.historyRect.height - 34) / rowHeight));
  const recent = state.guessHistory.slice(-maxRows).reverse();
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  recent.forEach((guess, index) => {
    const y = layout.historyRect.y + 34 + index * rowHeight;
    ctx.fillStyle = '#eff8ff';
    ctx.fillText(`#${state.guessHistory.length - index}  ${guess.digits.join('')}`, layout.historyRect.x + 16, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(117, 246, 200, 0.92)';
    ctx.fillText(`${guess.bulls} exact`, layout.historyRect.x + layout.historyRect.width - 86, y);
    ctx.fillStyle = 'rgba(255, 212, 103, 0.94)';
    ctx.fillText(`${guess.cows} near`, layout.historyRect.x + layout.historyRect.width - 16, y);
    ctx.textAlign = 'left';
  });

  if (recent.length === 0) {
    ctx.fillStyle = 'rgba(180, 202, 229, 0.72)';
    ctx.fillText('Probe the lock. Precision improves the final score.', layout.historyRect.x + 16, layout.historyRect.y + 42);
  }
  ctx.restore();
}
