import { act, fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import gameReducer from '../../../store/gameSlice'
import publicOpinionReducer, {
  addDirection,
  initializeProfiles,
} from '../../../publicOpinion/publicOpinionSlice'
import type { PublicDirection } from '../../../publicOpinion/types'
import { createAudienceRequestStory } from '../../../publicOpinion/publicRequestNarratives'
import PublicMeter from '../PublicMeter'

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      publicOpinion: publicOpinionReducer,
    },
  })
}

function makeDirection(
  playerId: string,
  overrides: Partial<PublicDirection> = {}
): PublicDirection {
  return {
    id: `dir-${playerId}`,
    type: 'win_competition',
    playerId,
    description: 'Win the next competition!',
    status: 'active',
    createdWeek: 1,
    expiresAtWeek: 2,
    approvalDelta: 5,
    ...overrides,
  }
}

function renderPublicMeter(initialEntry = '/public-meter') {
  const store = makeStore()
  const playerIds = store.getState().game.players.map((player) => player.id)
  const humanId = store.getState().game.players.find((player) => player.isUser)!.id
  act(() => {
    store.dispatch(initializeProfiles(playerIds))
    store.dispatch(addDirection(makeDirection(humanId)))
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/public-meter" element={<PublicMeter />} />
        </Routes>
      </Provider>
    </MemoryRouter>
  )
}

describe('PublicMeter tabs', () => {
  it('shows overview content by default', () => {
    renderPublicMeter('/public-meter')
    expect(screen.getByRole('tab', { name: 'Public Meter' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.queryByText('Your Approval')).not.toBeNull()
    expect(screen.queryByText('Public Rankings')).not.toBeNull()
    expect(screen.queryByText('Public Feed')).not.toBeNull()
    expect(screen.queryAllByText('Public Requests')).toHaveLength(1)
  })

  it('opens requests tab from the query param', () => {
    renderPublicMeter('/public-meter?tab=requests')
    expect(screen.getByRole('tab', { name: /Public Requests/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.queryByText('Your Approval')).toBeNull()
    expect(screen.getAllByText('Public Requests').length).toBeGreaterThan(0)
    expect(screen.queryByText('Win the next competition!')).not.toBeNull()
  })

  it('opens the audience dossier from the hero', () => {
    renderPublicMeter('/public-meter')
    fireEvent.click(screen.getByRole('button', { name: /open your audience dossier/i }))

    expect(screen.getByRole('dialog', { name: /you/i })).not.toBeNull()
    expect(screen.getByText('Charisma')).not.toBeNull()
    expect(screen.getByText('Game')).not.toBeNull()
    expect(screen.getByText('Integrity')).not.toBeNull()
  })

  it('keeps action instructions out of request cards and presents AI requests as audience stories', () => {
    const store = makeStore()
    const players = store.getState().game.players
    const human = players.find((player) => player.isUser)!
    const ai = players.find((player) => !player.isUser)!
    const expectedStory = createAudienceRequestStory({
      type: 'get_closer',
      playerName: ai.name,
      relatedName: human.name,
      seed: `dir-${ai.id}`,
    })
    act(() => {
      store.dispatch(initializeProfiles(players.map((player) => player.id)))
      store.dispatch(
        addDirection(
          makeDirection(human.id, {
            actionHint: 'Use Social → Clear the Air.',
            rationale: 'This remains useful context for your own request.',
          })
        )
      )
      store.dispatch(
        addDirection(
          makeDirection(ai.id, {
            type: 'get_closer',
            relatedPlayerId: human.id,
            description: 'Legacy instruction that should not be shown to viewers.',
            actionHint: 'Use Social → Share a story.',
            rationale: 'Legacy internal rationale.',
          })
        )
      )
    })

    render(
      <MemoryRouter initialEntries={['/public-meter?tab=requests']}>
        <Provider store={store}>
          <Routes>
            <Route path="/public-meter" element={<PublicMeter />} />
          </Routes>
        </Provider>
      </MemoryRouter>
    )

    expect(screen.getByText(expectedStory)).not.toBeNull()
    expect(screen.queryByText(/How:/)).toBeNull()
    expect(screen.queryByText('Why now: Legacy internal rationale.')).toBeNull()
    expect(screen.getByText('Why now: This remains useful context for your own request.')).not.toBeNull()
  })
})
