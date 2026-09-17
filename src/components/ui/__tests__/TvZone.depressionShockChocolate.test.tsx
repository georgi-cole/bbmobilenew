import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import gameReducer, {
  addTvEvent,
  consumeBroadcastEvent,
  setPhase,
} from '../../../store/gameSlice'
import socialReducer from '../../../social/socialSlice'
import profilesReducer from '../../../store/profilesSlice'
import challengeReducer from '../../../store/challengeSlice'
import finaleReducer from '../../../store/finaleSlice'
import settingsReducer from '../../../store/settingsSlice'
import DepressionShockController from '../../DepressionShockController/DepressionShockController'
import TvZone from '../TvZone'
import { I18nContext, type I18nContextValue } from '../../../i18n/I18nContext'
import { translate } from '../../../i18n/messages'

vi.mock('../../DepressionShockController/DepressionShockRosterCinematic', () => ({
  default: ({ kind }: { kind: string }) =>
    React.createElement('div', { 'data-testid': `depression-shock-${kind}` }),
}))

const TEST_I18N: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: (value) => String(value),
  formatDate: (value) => String(value),
}

const CHOCOLATE_TEXT =
  'The Big Eye has left chocolates for everyone. Wrappers open in the quiet, but the rain keeps speaking louder. 🍫'

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
  store.dispatch(setPhase('social_1'))
  return store
}

function renderHarness(store: ReturnType<typeof makeStore>) {
  return render(
    <I18nContext.Provider value={TEST_I18N}>
      <Provider store={store}>
        <MemoryRouter>
          <DepressionShockController />
          <TvZone />
        </MemoryRouter>
      </Provider>
    </I18nContext.Provider>
  )
}

describe('Depression Shock chocolate presentation', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('consumes the chocolate source on the first handoff so the card and cinematic cannot replay', async () => {
    const store = makeStore()
    const week = store.getState().game.week

    // Reproduce the real failure mode: a plain managed message owns the queue,
    // while the later major chocolate event is discoverable as an announcement.
    // Previously the major card could be shown early, then return when it later
    // became the queue head, firing the chocolate cinematic a second time.
    act(() => {
      store.dispatch(
        addTvEvent({
          text: 'A quiet social beat is already waiting on the Faux TV.',
          type: 'social',
          source: 'system',
          channels: ['tv', 'mainLog'],
          meta: {
            week,
            phase: 'social_1',
            forceOnTv: true,
            broadcastLevel: 'minor',
            broadcastOrder: -100,
          },
        })
      )
      store.dispatch(
        addTvEvent({
          text: CHOCOLATE_TEXT,
          type: 'social',
          source: 'system',
          channels: ['tv', 'mainLog'],
          meta: {
            week,
            phase: 'social_1',
            broadcastTemplateId: 'depression-shock.chocolates',
            broadcastCampaign: 'depression_shock',
            broadcastLevel: 'major',
            major: 'depression_shock_chocolates',
            forceOnTv: true,
            depressionShockQueued: true,
          },
        })
      )
    })

    const chocolatePresented = vi.fn()
    window.addEventListener('depression-shock:chocolate-presented', chocolatePresented)
    renderHarness(store)

    expect(screen.getByRole('dialog', { name: /Announcement: A small comfort/i })).toBeDefined()

    act(() => {
      window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })

    await waitFor(() => {
      const chocolateEvent = store
        .getState()
        .game.tvFeed.find(
          (event) => event.meta?.broadcastTemplateId === 'depression-shock.chocolates'
        )
      expect(chocolateEvent?.meta?.broadcastConsumed).toBe(true)
      expect(chocolatePresented).toHaveBeenCalledTimes(1)
      expect(screen.queryByRole('dialog', { name: /Announcement: A small comfort/i })).toBeNull()
    })

    // The next Play is allowed to deal with the plain queue item/phase. It must
    // never re-promote the already presented chocolate card or fire its effect.
    act(() => {
      window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Announcement: A small comfort/i })).toBeNull()
      expect(chocolatePresented).toHaveBeenCalledTimes(1)
    })

    window.removeEventListener('depression-shock:chocolate-presented', chocolatePresented)
  })
})
