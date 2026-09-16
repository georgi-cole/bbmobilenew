export type SocialResourceBadgeKind = 'energy' | 'influence' | 'info'

const SELECTORS: Record<SocialResourceBadgeKind, string> = {
  energy: '.sp2-energy-chip',
  influence: '.sp2-resource-chip--influence',
  info: '.sp2-resource-chip--info',
}

const timers = new WeakMap<HTMLElement, number>()

/**
 * Presentation-only acknowledgement for resource gains.  The resource chips
 * may not be mounted when a reward lands; in that case we deliberately do
 * nothing rather than queue a stale animation for later.
 */
export function shimmerSocialResourceBadge(kind: SocialResourceBadgeKind): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const element = document.querySelector<HTMLElement>(SELECTORS[kind])
  if (!element) return

  const previousTimer = timers.get(element)
  if (previousTimer !== undefined) window.clearTimeout(previousTimer)

  element.classList.remove('sp2-resource-gain-shimmer')
  // Restart the very short animation when two gains land in the same tick.
  void element.offsetWidth
  element.classList.add('sp2-resource-gain-shimmer')

  const timer = window.setTimeout(() => {
    element.classList.remove('sp2-resource-gain-shimmer')
    timers.delete(element)
  }, 720)
  timers.set(element, timer)
}
