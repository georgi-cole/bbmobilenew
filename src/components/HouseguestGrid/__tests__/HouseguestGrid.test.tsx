import { describe, expect, it, afterEach, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import HouseguestGrid, { type Houseguest } from '../HouseguestGrid';

function rect({
  top = 0,
  left = 0,
  width = 0,
  height = 0,
}: {
  top?: number
  left?: number
  width?: number
  height?: number
}) {
  return {
    x: left,
    y: top,
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect
}

describe('HouseguestGrid', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders a 16-player grid and reserves vertical space up to the floating dock', () => {
    vi.stubGlobal('innerHeight', 812)

    const headerEl = document.createElement('div')
    headerEl.className = 'tv-zone'
    document.body.appendChild(headerEl)

    const dockEl = document.createElement('div')
    dockEl.className = 'game-control-dock'
    document.body.appendChild(dockEl)

    const footerEl = document.createElement('nav')
    footerEl.className = 'nav-bar'
    document.body.appendChild(footerEl)

    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('tv-zone')) return rect({ top: 12, height: 308 })
      if (this.classList.contains('game-control-dock')) return rect({ top: 624, height: 76 })
      if (this.classList.contains('nav-bar')) return rect({ top: 734, height: 78 })
      if (this.getAttribute('aria-labelledby') === 'houseguests-heading') {
        return rect({ top: 338, height: 260 })
      }
      return rect({})
    })

    expect(rectSpy).toBeDefined()

    const houseguests: Houseguest[] = Array.from({ length: 16 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }))

    const { container } = render(
      <HouseguestGrid
        houseguests={houseguests}
        gridSize={16}
        occupancyLabel="16/16"
        overlaySelector=".game-control-dock"
      />,
    )

    const section = container.querySelector('section')
    const list = screen.getByRole('list')

    expect(section?.style.getPropertyValue('--grid-available-height')).toBe('266px')
    expect(within(list).getAllByRole('listitem')).toHaveLength(16)
  })
})
