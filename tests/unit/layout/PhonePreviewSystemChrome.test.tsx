import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import PhonePreviewSystemChrome from '../../../src/components/layout/PhonePreviewSystemChrome'

describe('PhonePreviewSystemChrome', () => {
  afterEach(() => {
    window.name = ''
  })

  it('injects realistic iPhone safe areas and service chrome', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/?phonePreview=true&phonePlatform=iphone']}>
        <PhonePreviewSystemChrome />
      </MemoryRouter>
    )

    expect(screen.getByLabelText('iPhone simulated status bar')).toBeInTheDocument()
    expect(screen.getByText('KoleTel')).toBeInTheDocument()
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('59px')
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-bottom')).toBe('34px')

    unmount()
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('')
  })

  it('simulates immersive Android gameplay by hiding the status row and releasing its inset', () => {
    window.name = 'phone-preview:android'
    render(
      <MemoryRouter initialEntries={['/game']}>
        <PhonePreviewSystemChrome />
      </MemoryRouter>
    )

    expect(screen.queryByLabelText('Android simulated status bar')).not.toBeInTheDocument()
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('0px')
    expect(document.documentElement).toHaveClass('is-native-status-bar-hidden')
    expect(document.querySelector('.phone-preview-chrome__home--android')).not.toBeNull()
  })

  it('restores Android status chrome outside gameplay', () => {
    window.name = 'phone-preview:android'
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <PhonePreviewSystemChrome />
      </MemoryRouter>
    )

    expect(screen.getByLabelText('Android simulated status bar')).toBeInTheDocument()
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('28px')
  })
})
