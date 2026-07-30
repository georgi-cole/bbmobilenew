import { getRouteFlag } from './routeQuery';

const VISUAL_FREEZE_ATTR = 'data-visual-freeze';
const VISUAL_FREEZE_CLASS = 'no-animations';

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

  // Keep requestAnimationFrame available. Several minigames use it for their
  // first board paint, so replacing it with a no-op captures an empty surface.
  // The CSS freeze above is sufficient to make screenshot states stable.
  return enabled;
}
