import { describe, expect, it, afterEach, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, within, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import HouseguestGrid, { type Houseguest } from '../HouseguestGrid';
import gameReducer from '../../../store/gameSlice';
import challengeReducer from '../../../store/challengeSlice';

function rect({
  top = 0,
  left = 0,
  width = 0,
  height = 0,
}: {
  top?: number;
  left?: number;
  width?: number;
  height?: number;
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

function renderGrid(ui: ReactElement) {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
    },
  })

  return render(<Provider store={store}>{ui}</Provider>)
}

describe('HouseguestGrid', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  })

  it('renders a 16-player grid and reserves vertical space up to the floating dock', () => {
    vi.stubGlobal('innerHeight', 812)

    const headerEl = document.createElement('div')
    headerEl.className = 'test-tv-zone'
    document.body.appendChild(headerEl)

    const dockEl = document.createElement('div')
    dockEl.className = 'test-dock'
    document.body.appendChild(dockEl)

    const footerEl = document.createElement('nav')
    footerEl.className = 'test-nav'
    document.body.appendChild(footerEl)

    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('test-tv-zone')) return rect({ top: 12, height: 308 })
      if (this.classList.contains('test-dock')) return rect({ top: 624, height: 76 })
      if (this.classList.contains('test-nav')) return rect({ top: 734, height: 78 })
      if (this.getAttribute('aria-labelledby') === 'houseguests-heading') {
        return rect({ top: 338, height: 260 })
      }
      if (this.getAttribute('role') === 'list') {
        return rect({ top: 372, height: 226 })
      }
      return rect({})
    })

    expect(rectSpy).toBeDefined()

    const houseguests: Houseguest[] = Array.from({ length: 16 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }))

    const { container } = renderGrid(
      <HouseguestGrid
        houseguests={houseguests}
        gridSize={16}
        occupancyLabel="16/16"
        headerSelector=".test-tv-zone"
        footerSelector=".test-nav"
        overlaySelector=".test-dock"
      />,
    )

    const section = container.querySelector('section')
    const list = screen.getByRole('list')

    expect(section?.style.getPropertyValue('--grid-available-height')).toBe('248px')
    expect(within(list).getAllByRole('listitem')).toHaveLength(16)
  })

  it('tracks the visual viewport when mobile browser chrome changes the available height', () => {
    vi.stubGlobal('innerHeight', 900)
    vi.stubGlobal('visualViewport', {
      height: 620,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })

    const headerEl = document.createElement('div')
    headerEl.className = 'test-tv-zone'
    document.body.appendChild(headerEl)

    const dockEl = document.createElement('div')
    dockEl.className = 'test-dock'
    document.body.appendChild(dockEl)

    const footerEl = document.createElement('nav')
    footerEl.className = 'test-nav'
    document.body.appendChild(footerEl)

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('test-tv-zone')) return rect({ top: 12, height: 308 })
      if (this.classList.contains('test-dock')) return rect({ top: 560, height: 76 })
      if (this.classList.contains('test-nav')) return rect({ top: 830, height: 78 })
      if (this.getAttribute('aria-labelledby') === 'houseguests-heading') {
        return rect({ top: 338, height: 260 })
      }
      if (this.getAttribute('role') === 'list') {
        return rect({ top: 372, height: 226 })
      }
      return rect({})
    })

    const houseguests: Houseguest[] = Array.from({ length: 16 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }))

    const { container } = renderGrid(
      <HouseguestGrid
        houseguests={houseguests}
        gridSize={16}
        occupancyLabel="16/16"
        headerSelector=".test-tv-zone"
        footerSelector=".test-nav"
        overlaySelector=".test-dock"
      />,
    )

    expect((container.firstElementChild as HTMLElement | null)?.style.getPropertyValue('--grid-available-height')).toBe('220px')
  })

  it('renders the compact small layout when requested', () => {
    const houseguests: Houseguest[] = Array.from({ length: 6 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }))

    const { container } = renderGrid(
      <HouseguestGrid
        houseguests={houseguests}
        compact
        placeholderCount={2}
      />,
    )

    expect(container.querySelector('section')?.getAttribute('data-compact-layout')).toBe('small')
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(8)
  })
})
