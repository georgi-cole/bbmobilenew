import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MusicCueEditor from '../../../src/screens/SettingsAdmin/MusicCueEditor'
import { createMusicConfig } from '../../../src/services/sound/musicConfig'

describe('MusicCueEditor draft lifecycle', () => {
  it('keeps new and duplicated unsaved cues editable', () => {
    render(
      <MusicCueEditor
        localOverrides={{}}
        effectiveConfig={createMusicConfig()}
        effectiveAssetMap={new Map()}
        onCommit={vi.fn()}
        onMessage={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'New cue' }))
    expect(screen.getByRole('heading', { name: 'General Competition Cue' })).toBeInTheDocument()
    expect(screen.getByText('competition_cue')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(screen.getByText('competition_cue_2')).toBeInTheDocument()
  })
})
