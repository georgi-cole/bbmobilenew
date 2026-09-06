import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import RouteLoadingScreen from '../RouteLoadingScreen'

describe('RouteLoadingScreen', () => {
  afterEach(() => cleanup())

  it('marks the route loading handoff so persistent chrome can be hidden', () => {
    const view = render(<RouteLoadingScreen />)

    expect(screen.getByRole('status', { name: 'Loading screen' })).toHaveTextContent(
      'Preparing the house…'
    )
    expect(document.documentElement).toHaveClass('route-loading-active')

    view.unmount()

    expect(document.documentElement).not.toHaveClass('route-loading-active')
  })
})
