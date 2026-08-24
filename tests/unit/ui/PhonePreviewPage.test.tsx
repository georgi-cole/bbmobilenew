import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import PhonePreviewPage from '../../../src/screens/PhonePreviewPage/PhonePreviewPage'

function renderPreview(initialEntry = '/phone-preview') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PhonePreviewPage />
    </MemoryRouter>
  )
}

describe('PhonePreviewPage', () => {
  it('renders representative iPhone and Android previews together', () => {
    renderPreview()

    expect(screen.getByText('iPhone 15 / 16 Pro')).toBeInTheDocument()
    expect(screen.getByText('Google Pixel 8 / 9')).toBeInTheDocument()
    expect(screen.getByText('393 × 852')).toBeInTheDocument()
    expect(screen.getByText('412 × 915')).toBeInTheDocument()
    expect(screen.getAllByTitle(/Full game · start or continue preview$/)).toHaveLength(2)
    expect(screen.getAllByTitle(/Full game · start or continue preview$/)[0]).toHaveAttribute(
      'name',
      'phone-preview:iphone'
    )
  })

  it('opens the same requested twist in both device frames', () => {
    renderPreview('/phone-preview?target=battleBack')

    const frames = screen.getAllByTitle(/Back 2 the Game preview$/) as HTMLIFrameElement[]
    expect(frames).toHaveLength(2)
    expect(frames[0]?.getAttribute('src')).toContain('preview=battle-back')
    expect(frames[0]?.getAttribute('src')).toContain('phonePlatform=iphone')
    expect(frames[1]?.getAttribute('src')).toContain('preview=battle-back')
    expect(frames[1]?.getAttribute('src')).toContain('phonePlatform=android')
  })

  it('switches both frames to a Twin Shock outcome', async () => {
    const user = userEvent.setup()
    renderPreview()

    await user.selectOptions(screen.getByLabelText('Screen'), 'twinShockSecret')

    const frames = screen.getAllByTitle(/Twin Shock · secret kept preview$/) as HTMLIFrameElement[]
    expect(frames).toHaveLength(2)
    expect(frames.every((frame) => frame.getAttribute('src')?.includes('twin-shock-secret'))).toBe(
      true
    )
  })
})
