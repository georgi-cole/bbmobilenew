import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCeremonyTileRect } from '../../../src/screens/GameScreen/ceremonyTileMeasurement'

function rect(top: number, height: number, width = 80) {
  return new DOMRect(10, top, width, height)
}

function mountRoster({
  rosterMode,
  tileRect = rect(20, 80),
  scrollRect = rect(0, 320, 360),
}: {
  rosterMode: 'normal' | 'compact-small' | 'scroll'
  tileRect?: DOMRect
  scrollRect?: DOMRect
}) {
  const section = document.createElement('section')
  section.dataset.rosterMode = rosterMode
  const list = document.createElement('ul')
  if (rosterMode === 'scroll') {
    list.dataset.rosterScroll = 'true'
  }
  const item = document.createElement('li')
  item.dataset.playerId = 'p4'
  item.getBoundingClientRect = vi.fn(() => tileRect)
  item.scrollIntoView = vi.fn()
  list.getBoundingClientRect = vi.fn(() => scrollRect)
  list.append(item)
  section.append(list)
  document.body.append(section)

  return { item, list, section }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('getCeremonyTileRect', () => {
  it('measures normal roster tiles without scrolling the roster', () => {
    const { item } = mountRoster({ rosterMode: 'normal' })

    const measured = getCeremonyTileRect('p4')

    expect(measured?.width).toBe(80)
    expect(item.scrollIntoView).not.toHaveBeenCalled()
  })

  it('measures compact roster tiles without changing their position', () => {
    const { item } = mountRoster({ rosterMode: 'compact-small' })

    const measured = getCeremonyTileRect('p4')

    expect(measured?.height).toBe(80)
    expect(item.scrollIntoView).not.toHaveBeenCalled()
  })

  it('centers an offscreen target only when the roster is internally scrollable', () => {
    const { item } = mountRoster({
      rosterMode: 'scroll',
      tileRect: rect(420, 80),
      scrollRect: rect(0, 320, 360),
    })

    const measured = getCeremonyTileRect('p4')

    expect(measured?.top).toBe(420)
    expect(item.scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' })
  })

  it('returns null for missing or zero-size targets', () => {
    expect(getCeremonyTileRect('missing')).toBeNull()

    mountRoster({ rosterMode: 'normal', tileRect: rect(20, 0, 0) })
    expect(getCeremonyTileRect('p4')).toBeNull()
  })
})
