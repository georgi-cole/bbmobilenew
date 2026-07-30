import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer from '../../src/store/gameSlice'
import challengeReducer from '../../src/store/challengeSlice'
import socialReducer from '../../src/social/socialSlice'
import uiReducer from '../../src/store/uiSlice'
import settingsReducer, { setGameUX } from '../../src/store/settingsSlice'
import profilesReducer from '../../src/store/profilesSlice'
import adsReducer from '../../src/store/adsSlice'
import remoteConfigReducer from '../../src/remoteConfig/remoteConfigSlice'
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice'
import GameScreen from '../../src/screens/GameScreen/GameScreen'
import type { GameState } from '../../src/types'

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}))

vi.mock('../../src/store/confessionalDecisionSelectors', () => ({
  selectActiveConfessionalDecision: () => null,
}))

vi.mock('../../src/components/CeremonyOverlay/CeremonyOverlay', () => ({
  default: ({
    caption,
    resolveTiles,
  }: {
    caption: string
    resolveTiles?: () => unknown
  }) => {
    resolveTiles?.()
    return <div data-testid="ceremony-overlay">{caption}</div>
  },
}))

vi.mock('../../src/components/ui/TvZone', () => ({
  default: ({ mainLogMaxVisible }: { mainLogMaxVisible?: number }) => (
    <div className="tv-zone" data-log-rows={mainLogMaxVisible ?? 2} data-testid="tv-zone" />
  ),
}))

function makeStore(gameOverrides: Partial<GameState> = {}) {
  const base = gameReducer(undefined, { type: '@@INIT' })
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
      profiles: profilesReducer,
      ads: adsReducer,
      remoteConfig: remoteConfigReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: { game: { ...base, ...gameOverrides } },
  })
}

function makeCupidOverrides(overrides: Partial<GameState> = {}): Partial<GameState> {
  const base = gameReducer(undefined, { type: '@@INIT' })
  const pairedPlayers = base.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury',
  )
  const pairs = Array.from({ length: Math.floor(pairedPlayers.length / 2) }, (_, index) => ({
    id: `layout-cupid-pair-${index + 1}`,
    memberIds: [pairedPlayers[index * 2].id, pairedPlayers[index * 2 + 1].id] as [string, string],
    color: '#ff5d8f',
  }))

  return {
    season: 77,
    cupidArrow: {
      scheduledSeason: 77,
      status: 'active',
      activatedSeason: 77,
      activatedWeek: 1,
      pairs,
      eliminatedPairCount: 0,
      pendingPartnerEvictionId: null,
    },
    ...overrides,
  }
}

function renderGameScreen(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>
    </Provider>,
  )
}

describe('GameScreen compact roster balancing', () => {
  it('expands the tv stack for compact mode and requests a taller log feed', () => {
    const store = makeStore()

    store.dispatch(setGameUX({ compactRoster: true }))

    const { container } = renderGameScreen(store)

    expect(container.firstElementChild).toHaveClass('game-screen--compact-roster-balance')
    expect(screen.getByTestId('tv-zone')).toHaveAttribute('data-log-rows', '3')
  })

  it('keeps the roster balance active on narrow viewports so the TV log stays visible', () => {
    const store = makeStore()

    store.dispatch(setGameUX({ compactRoster: true }))
    vi.stubGlobal('innerWidth', 390)
    vi.stubGlobal('innerHeight', 844)

    const { container } = renderGameScreen(store)

    expect(container.firstElementChild).toHaveClass('game-screen--compact-roster-balance')
    expect(screen.getByTestId('tv-zone')).toHaveAttribute('data-log-rows', '3')
  })
})

describe("GameScreen Cupid's Arrow presentation", () => {
  it('marks the game shell while the pairs format is active', () => {
    const store = makeStore(makeCupidOverrides())

    const { container } = renderGameScreen(store)

    expect(container.firstElementChild).toHaveClass('game-screen--cupid-active')
  })

  it('names both partners in the outgoing LOH eligibility warning', () => {
    const base = gameReducer(undefined, { type: '@@INIT' })
    const human = base.players.find((player) => player.isUser)!
    const partnerId = makeCupidOverrides().cupidArrow!.pairs.find((pair) =>
      pair.memberIds.includes(human.id),
    )!.memberIds.find((id) => id !== human.id)!
    const partner = base.players.find((player) => player.id === partnerId)!
    const store = makeStore(
      makeCupidOverrides({
        phase: 'loh_comp',
        prevHohId: human.id,
      }),
    )

    renderGameScreen(store)

    expect(
      screen.getByText(
        `As the outgoing LOH pair, you and ${partner.name} are not eligible to compete.`,
      ),
    ).toBeInTheDocument()
  })

  it('explains that the human LOH nominates two pairs', () => {
    const base = gameReducer(undefined, { type: '@@INIT' })
    const human = base.players.find((player) => player.isUser)!
    const store = makeStore(
      makeCupidOverrides({
        phase: 'nomination_results',
        lohId: human.id,
        awaitingNominations: true,
      }),
    )

    renderGameScreen(store)

    expect(
      screen.getByText(`${human.name}, choose two pairs to nominate for elimination.`),
    ).toBeInTheDocument()
  })

  it('uses plural winner copy when a paired LOH result is revealed', () => {
    const base = gameReducer(undefined, { type: '@@INIT' })
    const human = base.players.find((player) => player.isUser)!
    const winnerId = base.players.find((player) => !player.isUser)!.id
    const store = makeStore(
      makeCupidOverrides({
        phase: 'loh_results',
        prevHohId: human.id,
        lohId: winnerId,
      }),
    )

    renderGameScreen(store)

    expect(screen.getByText(/ win Leader of the House!$/)).toBeInTheDocument()
  })
})
