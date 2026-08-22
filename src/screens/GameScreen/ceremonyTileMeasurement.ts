export const ROSTER_SCROLL_SELECTOR = '[data-roster-scroll="true"]'
export const HOUSEGUEST_ROSTER_SELECTOR = '[data-houseguest-roster="true"]'
export const CEREMONY_TILE_SELECTOR = '[data-ceremony-tile="true"]'

function escapePlayerIdForAttributeSelector(playerId: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(playerId)
  }

  return playerId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function scrollCeremonyTileIntoView(el: HTMLElement) {
  const playerHost = el.closest<HTMLElement>('[data-player-id]') ?? el
  const scrollRoot = playerHost.closest<HTMLElement>(ROSTER_SCROLL_SELECTOR)
  if (!scrollRoot) return

  const tileRect = el.getBoundingClientRect()
  const scrollRect = scrollRoot.getBoundingClientRect()
  const isOutsideVisibleRoster =
    tileRect.top < scrollRect.top || tileRect.bottom > scrollRect.bottom

  if (isOutsideVisibleRoster && typeof playerHost.scrollIntoView === 'function') {
    playerHost.scrollIntoView({ block: 'center', inline: 'nearest' })
  }
}

export function getCeremonyTileElement(
  playerId: string,
  root: ParentNode = document
): HTMLElement | null {
  const escaped = escapePlayerIdForAttributeSelector(playerId)
  const roster =
    root instanceof Element && root.matches(HOUSEGUEST_ROSTER_SELECTOR)
      ? root
      : root.querySelector<HTMLElement>(HOUSEGUEST_ROSTER_SELECTOR)
  const playerHost = (roster ?? root).querySelector<HTMLElement>(`[data-player-id="${escaped}"]`)
  if (!playerHost) return null

  // Measure the painted square, not its grid cell. Framer Motion can transform
  // the avatar wrapper independently during shared-layout transitions, so the
  // outer <li> can report a different rectangle from what the user sees.
  const el = playerHost.querySelector<HTMLElement>(CEREMONY_TILE_SELECTOR) ?? playerHost
  scrollCeremonyTileIntoView(el)
  return el
}

export function getCeremonyTileRect(playerId: string, root: ParentNode = document): DOMRect | null {
  const el = getCeremonyTileElement(playerId, root)
  if (!el) return null

  const rect = el.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0 ? rect : null
}
