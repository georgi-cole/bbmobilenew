import { act, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import gameReducer, { addTvEvent, consumeBroadcastEvent, setPhase } from '../../../store/gameSlice'
import socialReducer from '../../../social/socialSlice'
import profilesReducer from '../../../store/profilesSlice'
import challengeReducer from '../../../store/challengeSlice'
import finaleReducer from '../../../store/finaleSlice'
import settingsReducer from '../../../store/settingsSlice'
import { setDepressionShockVisualPhase } from '../../../features/twists/depressionShock'
import TvZone from '../TvZone'
import { I18nContext, type I18nContextValue } from '../../../i18n/I18nContext'
import { translate } from '../../../i18n/messages'

const TEST_I18N: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: (value) => String(value),
  formatDate: (value) => String(value),
}

const RECOVERY_TEXT =
  'Morning light breaks through the clouds. Colour returns, familiar faces reappear, and the hub finally exhales.'

function makeStore() {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      finale: finaleReducer,
      settings: settingsReducer,
    },
  })

  for (const id of store.getState().game.broadcastQueue ?? []) {
    store.dispatch(consumeBroadcastEvent(id))
  }
  store.dispatch(setPhase('week_start'))
  return store
}

function renderTvZone(store: ReturnType<typeof makeStore>) {
  return render(
    <I18nContext.Provider value={TEST_I18N}>
      <Provider store={store}>
        <MemoryRouter>
          <TvZone />
        </MemoryRouter>
      </Provider>
    </I18nContext.Provider>
  )
}

afterEach(() => {
  setDepressionShockVisualPhase('inactive')
})

describe('TvZone Depression Shock recovery handoff', () => {
  it('replaces the acknowledged Day Start weather card with the recovery broadcast', () => {
    const store = makeStore()
    const week = store.getState().game.week

    setDepressionShockVisualPhase('sunbreak')

    act(() => {
      store.dispatch(
        addTvEvent({
          text: `Day ${week} has begun. Get ready.`,
          type: 'game',
          source: 'system',
          channels: ['tv', 'mainLog'],
          meta: {
            key: 'day_start',
            phase: 'week_start',
            week,
            broadcastTemplateId: 'week.day-start',
            broadcastLevel: 'minor',
            forceOnTv: true,
          },
        })
      )
    })

    renderTvZone(store)

    // The first beat is the sunny Day Start/weather presentation.
    expect(screen.queryByRole('dialog', { name: /The sun returns/i })).toBeNull()
    expect(document.querySelector('.tv-zone__viewport--daily-transition')).not.toBeNull()

    // Model the first Play: the Day Start source is consumed but deliberately
    // retained as lastPlainBroadcastEventId for viewport continuity.
    const dayStart = store.getState().game.tvFeed.find((event) => event.meta?.key === 'day_start')
    expect(dayStart).toBeDefined()
    act(() => {
      store.dispatch(consumeBroadcastEvent(dayStart!.id))
    })
    expect(store.getState().game.lastPlainBroadcastEventId).toBe(dayStart!.id)

    // The sunrise cinematic now completes and publishes the recovery major.
    // Previously this key was not recognised as a real event major, so the
    // retained Day Start weather card won the viewport again.
    act(() => {
      store.dispatch(
        addTvEvent({
          text: `${RECOVERY_TEXT} Depression Shock is over.`,
          type: 'twist',
          source: 'system',
          channels: ['tv', 'mainLog'],
          meta: {
            major: 'depression_shock_end',
            broadcastPriority: 'critical',
            broadcastLevel: 'critical',
            broadcastCampaign: 'depression_shock',
            forceOnTv: true,
            phase: 'week_start',
            week,
          },
        })
      )
    })

    const recovery = screen.getByRole('dialog', { name: /Announcement: The sun returns/i })
    expect(recovery).toBeDefined()
    expect(recovery).toHaveTextContent(RECOVERY_TEXT)

    // The old weather copy may remain in the DOM as the hidden viewport layer,
    // but it must no longer be the visible presentation after the first Play.
    expect(document.querySelector('.tv-zone__now')).toHaveAttribute('aria-hidden', 'true')
  })
})
