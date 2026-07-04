export const ROSTER_SCROLL_SELECTOR = '[data-roster-scroll="true"]'

function escapePlayerIdForAttributeSelector(playerId: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(playerId)
  }

  return playerId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function getCeremonyTileRect(playerId: string, root: ParentNode = document): DOMRect | null {
  const escaped = escapePlayerIdForAttributeSelector(playerId)
  const el = root.querySelector<HTMLElement>(`[data-player-id="${escaped}"]`)
  if (!el) return null

  const scrollRoot = el.closest<HTMLElement>(ROSTER_SCROLL_SELECTOR)
  if (scrollRoot) {
    const tileRect = el.getBoundingClientRect()
    const scrollRect = scrollRoot.getBoundingClientRect()
    const isOutsideVisibleRoster = tileRect.top < scrollRect.top || tileRect.bottom > scrollRect.bottom

    if (isOutsideVisibleRoster && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', inline: 'nearest' })
    }
  }

  const rect = el.getBoundingClientRect()
  return rect.width > 0 || rect.height > 0 ? rect : null
}
