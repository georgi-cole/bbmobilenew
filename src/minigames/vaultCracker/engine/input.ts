import type { DialSlotLayout, Rect, VaultCrackerLayout } from './types';
import type { VaultCrackerCanvasEngine } from './vaultCrackerCanvasEngine';

interface PointerLocation {
  x: number;
  y: number;
}

export type HitTarget =
  | { kind: 'dial'; index: number }
  | { kind: 'submit' }
  | null;

function pointInRect(point: PointerLocation, rect: Rect): boolean {
  return (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  );
}

export function hitTestTarget(layout: VaultCrackerLayout, point: PointerLocation): HitTarget {
  const dialIndex = layout.dialSlots.findIndex((slot: DialSlotLayout) => pointInRect(point, slot));
  if (dialIndex >= 0) {
    return { kind: 'dial', index: dialIndex };
  }
  if (pointInRect(point, layout.submitRect)) {
    return { kind: 'submit' };
  }
  return null;
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: PointerEvent): PointerLocation {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function attachVaultCrackerInput(
  canvas: HTMLCanvasElement,
  engine: VaultCrackerCanvasEngine,
): () => void {
  const onPointerDown = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    engine.handlePointerDown(event.pointerId, getCanvasPoint(canvas, event));
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    engine.handlePointerMove(event.pointerId, getCanvasPoint(canvas, event));
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!event.isPrimary) return;
    engine.handlePointerUp(event.pointerId, getCanvasPoint(canvas, event));
    if (canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onPointerCancel = (event: PointerEvent) => {
    engine.handlePointerCancel(event.pointerId);
    if (canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('lostpointercapture', onPointerCancel);

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    canvas.removeEventListener('lostpointercapture', onPointerCancel);
  };
}
