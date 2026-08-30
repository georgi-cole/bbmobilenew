import { act } from 'react'
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TribunalMemberStage from '../src/components/TribunalMemberStage/TribunalMemberStage'
import {
  PHRASE_TYPING_CHAR_INTERVAL_MS,
  PHRASE_TYPING_START_DELAY_MS,
} from '../src/components/TribunalMemberStage/tribunalMemberStageTiming'

describe('TribunalMemberStage speech bubble', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the revealed phrase in a separate comic speech bubble beside the cutout', async () => {
    const phrase = 'I have seen enough to make my choice.'
    const { container } = render(
      <TribunalMemberStage
        revealedJurors={[
          {
            juror: { id: 'j1', name: 'Casey', avatar: '🧠', status: 'jury' },
            reveal: { jurorId: 'j1', finalistId: 'f1', phrase },
          },
        ]}
        awaitingHumanPlayer={null}
        finalists={[]}
        onCastVote={() => {}}
      />
    )

    expect(container.querySelector('.tms-phrase-wrap')).toBeNull()

    const speechBubble = container.querySelector('.tms-speech-bubble')
    const cutoutWrap = container.querySelector('.tms-cutout-wrap')

    expect(speechBubble).toBeTruthy()
    expect(cutoutWrap?.contains(speechBubble ?? null)).toBe(false)
    expect(cutoutWrap?.parentElement).toBe(speechBubble?.parentElement)

    await act(async () => {
      vi.advanceTimersByTime(
        PHRASE_TYPING_START_DELAY_MS + phrase.length * PHRASE_TYPING_CHAR_INTERVAL_MS
      )
    })

    const typedPhrase = container.querySelector('.tms-phrase')
    expect(typedPhrase?.textContent).toBe(phrase)
    expect(container.querySelector('.tms-phrase__cursor')).toBeNull()
  })
})
