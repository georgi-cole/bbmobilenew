import { getRouteFlag } from './routeQuery';

const VISUAL_FREEZE_ATTR = 'data-visual-freeze';
const VISUAL_FREEZE_CLASS = 'no-animations';

let originalRequestAnimationFrame: typeof window.requestAnimationFrame | null = null;
let originalCancelAnimationFrame: typeof window.cancelAnimationFrame | null = null;

function snapshotAnimationFrameApi(): void {
  if (typeof window === 'undefined') return;

  if (originalRequestAnimationFrame == null && typeof window.requestAnimationFrame === 'function') {
    originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  }

  if (originalCancelAnimationFrame == null && typeof window.cancelAnimationFrame === 'function') {
    originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  }
}

function applyAnimationFreeze(enabled: boolean): void {
  if (typeof window === 'undefined') return;

  snapshotAnimationFrameApi();

  if (enabled) {
    window.requestAnimationFrame = (() => 0) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
    return;
  }

  if (originalRequestAnimationFrame) {
    window.requestAnimationFrame = originalRequestAnimationFrame;
  }

  if (originalCancelAnimationFrame) {
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  }
}

export function isVisualFreezeEnabled(): boolean {
  return getRouteFlag('freeze');
}

export function applyVisualFreezeState(): boolean {
  if (typeof document === 'undefined') return false;

  const enabled = isVisualFreezeEnabled();
  const root = document.documentElement;

  if (enabled) {
    root.setAttribute(VISUAL_FREEZE_ATTR, 'true');
    document.body?.classList.add(VISUAL_FREEZE_CLASS);
  } else {
    root.removeAttribute(VISUAL_FREEZE_ATTR);
    document.body?.classList.remove(VISUAL_FREEZE_CLASS);
  }

  applyAnimationFreeze(enabled);
  return enabled;
}
