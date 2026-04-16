import type { QuickTapRaceCanvasEngine } from './quickTapRaceCanvasEngine';

interface CanvasPoint {
  x: number;
  y: number;
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent): CanvasPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function attachQuickTapRaceInput(
  canvas: HTMLCanvasElement,
  engine: QuickTapRaceCanvasEngine,
): () => void {
  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    engine.handlePointerTap(event.pointerId, getCanvasPoint(canvas, event));
  };

  const releasePointer = (pointerId: number) => {
    if (canvas.hasPointerCapture?.(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    engine.handlePointerRelease(pointerId);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    releasePointer(event.pointerId);
  };

  const onPointerCancel = (event: PointerEvent) => {
    releasePointer(event.pointerId);
  };

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onPointerCancel);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('lostpointercapture', onPointerCancel);
  };
}
