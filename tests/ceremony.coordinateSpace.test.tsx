import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import CeremonyOverlay from '../src/components/CeremonyOverlay/CeremonyOverlay'
import { normalizeRectToCeremonySurface } from '../src/components/CeremonyOverlay/ceremonyCoordinateSpace'
import { getCeremonyTileRect } from '../src/screens/GameScreen/ceremonyTileMeasurement'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ceremony coordinate space', () => {
  it('normalizes viewport geometry against a shifted and scaled overlay surface', () => {
    const target = new DOMRect(150, 260, 80, 100)

    expect(
      normalizeRectToCeremonySurface(target, {
        left: 50,
        top: 60,
        width: 400,
        height: 800,
        scaleX: 2,
        scaleY: 2,
      })
    ).toEqual({
      left: 50,
      top: 100,
      right: 90,
      bottom: 150,
      width: 40,
      height: 50,
    })
  })

  it('portals overlays to body and gives simultaneous SVG masks unique ids', () => {
    const rect = new DOMRect(30, 40, 70, 70)
    render(
      <>
        <CeremonyOverlay tiles={[{ rect }]} caption="First" onDone={vi.fn()} />
        <CeremonyOverlay tiles={[{ rect }]} caption="Second" onDone={vi.fn()} />
      </>
    )

    const surfaces = document.querySelectorAll<HTMLElement>('[data-ceremony-overlay-surface]')
    expect(surfaces).toHaveLength(2)
    expect(surfaces[0].parentElement).toBe(document.body)
    expect(surfaces[1].parentElement).toBe(document.body)

    const masks = document.querySelectorAll<SVGMaskElement>('.ceremony-overlay mask')
    expect(masks).toHaveLength(2)
    expect(masks[0].id).not.toBe(masks[1].id)

    const dimRects = document.querySelectorAll<SVGRectElement>(
      '.ceremony-overlay__dim > svg > rect'
    )
    expect(dimRects[0].getAttribute('mask')).toBe(`url(#${masks[0].id})`)
    expect(dimRects[1].getAttribute('mask')).toBe(`url(#${masks[1].id})`)
  })
})

describe('ceremony roster target selection', () => {
  it('ignores duplicate player ids outside the roster and measures the painted avatar square', () => {
    const outsideRect = new DOMRect(1, 2, 10, 10)
    const hostRect = new DOMRect(20, 30, 90, 110)
    const paintedRect = new DOMRect(24, 34, 82, 82)
    const view = render(
      <>
        <div data-player-id="winner" data-testid="outside" />
        <section data-houseguest-roster="true">
          <div data-player-id="winner" data-testid="host">
            <div data-ceremony-tile="true" data-testid="painted" />
          </div>
        </section>
      </>
    )

    vi.spyOn(view.getByTestId('outside'), 'getBoundingClientRect').mockReturnValue(outsideRect)
    vi.spyOn(view.getByTestId('host'), 'getBoundingClientRect').mockReturnValue(hostRect)
    vi.spyOn(view.getByTestId('painted'), 'getBoundingClientRect').mockReturnValue(paintedRect)

    expect(getCeremonyTileRect('winner')).toBe(paintedRect)
  })
})
