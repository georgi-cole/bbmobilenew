import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import TvZone from '../src/components/ui/TvZone'
import gameReducer, {
  addCustomBroadcast,
  consumeBroadcastEvent,
  setPhase,
  syncPhaseBroadcasts,
} from '../src/store/gameSlice'
import settingsReducer from '../src/store/settingsSlice'
import profilesReducer from '../src/store/profilesSlice'
import challengeReducer from '../src/store/challengeSlice'
import finaleReducer from '../src/store/finaleSlice'
import socialReducer from '../src/social/socialSlice'
import { I18nContext, type I18nContextValue } from '../src/i18n/I18nContext'
import { translate } from '../src/i18n/messages'

const TEST_I18N: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: (value) => String(value),
  formatDate: (value) => String(value),
}

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      profiles: profilesReducer,
      challenge: challengeReducer,
      finale: finaleReducer,
      social: socialReducer,
    },
  })
}

describe('manager-driven faux-TV queue', () => {
  it('does not retain a consumed forced-minor message after its phase ends', async () => {
    const store = makeStore()
    for (const id of store.getState().game.broadcastQueue ?? []) {
      store.dispatch(consumeBroadcastEvent(id))
    }
    store.dispatch(
      addCustomBroadcast({
        id: 'phase-scoped-plain',
        key: 'custom.phase-scoped-plain',
        phase: 'season_start',
        text: 'Only visible during season start',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: true,
        order: 10,
      })
    )
    store.dispatch(syncPhaseBroadcasts({ phase: 'season_start' }))
    const eventId = store.getState().game.broadcastQueue?.[0]
    expect(eventId).toBeTruthy()
    store.dispatch(consumeBroadcastEvent(eventId!))

    render(
      <I18nContext.Provider value={TEST_I18N}>
        <Provider store={store}>
          <MemoryRouter>
            <TvZone />
          </MemoryRouter>
        </Provider>
      </I18nContext.Provider>
    )

    expect(screen.getByRole('region', { name: 'Live game events display' })).toHaveTextContent(
      'Only visible during season start'
    )

    act(() => {
      store.dispatch(setPhase('week_start'))
    })

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: 'Live game events display' })
      ).not.toHaveTextContent('Only visible during season start')
    })
    expect(store.getState().game.lastPlainBroadcastEventId).toBeNull()
  })

  it('skips unchecked messages directly to the next eligible item', () => {
    const store = makeStore()
    for (const id of store.getState().game.broadcastQueue ?? []) {
      store.dispatch(consumeBroadcastEvent(id))
    }
    store.dispatch(
      addCustomBroadcast({
        id: 'unchecked-only',
        key: 'custom.unchecked-only',
        phase: 'democracia_results',
        text: 'This belongs only in the log',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: false,
        order: 10,
      })
    )
    store.dispatch(
      addCustomBroadcast({
        id: 'eligible-next',
        key: 'custom.eligible-next',
        phase: 'democracia_results',
        text: 'This is the next eligible message',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: true,
        order: 20,
      })
    )
    store.dispatch(setPhase('democracia_results'))
    store.dispatch(syncPhaseBroadcasts({ phase: 'democracia_results' }))

    render(
      <I18nContext.Provider value={TEST_I18N}>
        <Provider store={store}>
          <MemoryRouter>
            <TvZone />
          </MemoryRouter>
        </Provider>
      </I18nContext.Provider>
    )

    expect(store.getState().game.broadcastQueue).toHaveLength(1)
    const viewport = screen.getByRole('region', { name: 'Live game events display' })
    expect(viewport).not.toHaveTextContent('This belongs only in the log')
    expect(viewport).toHaveTextContent('This is the next eligible message')
    expect(viewport.querySelector('.tv-zone__now')).not.toHaveStyle({ opacity: '0' })
  })

  it('allows one Play press to acknowledge the final plain message and continue', () => {
    const store = makeStore()
    for (const id of store.getState().game.broadcastQueue ?? []) {
      store.dispatch(consumeBroadcastEvent(id))
    }
    store.dispatch(
      addCustomBroadcast({
        id: 'final-plain',
        key: 'custom.final-plain',
        phase: 'season_start',
        text: 'Final plain message',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: true,
        order: 10,
      })
    )
    store.dispatch(syncPhaseBroadcasts({ phase: 'season_start' }))

    render(
      <I18nContext.Provider value={TEST_I18N}>
        <Provider store={store}>
          <MemoryRouter>
            <TvZone />
          </MemoryRouter>
        </Provider>
      </I18nContext.Provider>
    )

    let accepted = false
    act(() => {
      accepted = window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })

    expect(accepted).toBe(true)
    expect(store.getState().game.broadcastQueue).toEqual([])
  })

  it('uses the quick reveal when moving between consecutive plain messages', () => {
    const store = makeStore()
    for (const id of store.getState().game.broadcastQueue ?? []) {
      store.dispatch(consumeBroadcastEvent(id))
    }
    store.dispatch(
      addCustomBroadcast({
        id: 'plain-one',
        key: 'custom.plain-one',
        phase: 'season_start',
        text: 'First consecutive message',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: true,
        order: 10,
      })
    )
    store.dispatch(
      addCustomBroadcast({
        id: 'plain-two',
        key: 'custom.plain-two',
        phase: 'season_start',
        text: 'Second consecutive message',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: true,
        order: 20,
      })
    )
    store.dispatch(syncPhaseBroadcasts({ phase: 'season_start' }))

    render(
      <I18nContext.Provider value={TEST_I18N}>
        <Provider store={store}>
          <MemoryRouter>
            <TvZone />
          </MemoryRouter>
        </Provider>
      </I18nContext.Provider>
    )

    const originalTextNode = document.querySelector('.tv-zone__now')
    expect(originalTextNode).toHaveTextContent('First consecutive message')

    let accepted = true
    act(() => {
      accepted = window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })

    expect(accepted).toBe(false)
    const updatedTextNode = document.querySelector('.tv-zone__now')
    expect(updatedTextNode).not.toBe(originalTextNode)
    expect(updatedTextNode).toHaveClass('tv-zone__now--quick-transition')
    expect(updatedTextNode).toHaveTextContent('Second consecutive message')
  })

  it('allows one Play press to acknowledge the final major card and continue', async () => {
    const store = makeStore()
    for (const id of store.getState().game.broadcastQueue ?? []) {
      store.dispatch(consumeBroadcastEvent(id))
    }
    store.dispatch(
      addCustomBroadcast({
        id: 'final-major',
        key: 'custom.final-major',
        phase: 'season_start',
        text: 'Final major card',
        title: 'Final major title',
        type: 'game',
        level: 'major',
        enabled: true,
        forceOnTv: true,
        order: 10,
      })
    )
    store.dispatch(syncPhaseBroadcasts({ phase: 'season_start' }))

    render(
      <I18nContext.Provider value={TEST_I18N}>
        <Provider store={store}>
          <MemoryRouter>
            <TvZone />
          </MemoryRouter>
        </Provider>
      </I18nContext.Provider>
    )
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /Announcement: Final major title/i })
      ).toBeInTheDocument()
    })

    let accepted = false
    act(() => {
      accepted = window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })

    expect(accepted).toBe(true)
    expect(store.getState().game.broadcastQueue).toEqual([])
  })

  it('shows the next managed message immediately after a major card dismissal', async () => {
    const store = makeStore()
    for (const id of store.getState().game.broadcastQueue ?? []) {
      store.dispatch(consumeBroadcastEvent(id))
    }
    store.dispatch(
      addCustomBroadcast({
        id: 'major-before-plain',
        key: 'custom.major-before-plain',
        phase: 'season_start',
        text: 'Ceremony card copy',
        title: 'Ceremony card title',
        type: 'game',
        level: 'major',
        enabled: true,
        forceOnTv: true,
        order: 10,
      })
    )
    store.dispatch(
      addCustomBroadcast({
        id: 'plain-after-major',
        key: 'custom.plain-after-major',
        phase: 'season_start',
        text: 'Immediate message after ceremony',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: true,
        order: 20,
      })
    )
    store.dispatch(syncPhaseBroadcasts({ phase: 'season_start' }))

    render(
      <I18nContext.Provider value={TEST_I18N}>
        <Provider store={store}>
          <MemoryRouter>
            <TvZone />
          </MemoryRouter>
        </Provider>
      </I18nContext.Provider>
    )
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /Announcement: Ceremony card title/i })
      ).toBeInTheDocument()
    })

    let accepted = true
    act(() => {
      accepted = window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })

    expect(accepted).toBe(false)
    const viewport = screen.getByRole('region', { name: 'Live game events display' })
    expect(viewport).toHaveTextContent('Immediate message after ceremony')
    expect(viewport.querySelector('.tv-zone__now')).not.toHaveStyle({ opacity: '0' })
  })

  it('plays forced minor, major, and critical messages in manager order before phase advance', async () => {
    const store = makeStore()
    for (const id of store.getState().game.broadcastQueue ?? []) {
      store.dispatch(consumeBroadcastEvent(id))
    }
    store.dispatch(
      addCustomBroadcast({
        id: 'minor-log',
        key: 'custom.minor-log',
        phase: 'season_start',
        text: 'Log only',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: false,
        order: 10,
      })
    )
    store.dispatch(
      addCustomBroadcast({
        id: 'minor-tv',
        key: 'custom.minor-tv',
        phase: 'season_start',
        text: 'Plain faux TV',
        type: 'game',
        level: 'minor',
        enabled: true,
        forceOnTv: true,
        order: 20,
      })
    )
    store.dispatch(
      addCustomBroadcast({
        id: 'major-tv',
        key: 'custom.major-tv',
        phase: 'season_start',
        text: 'Major copy',
        title: 'Major title',
        type: 'game',
        level: 'major',
        enabled: true,
        order: 30,
      })
    )
    store.dispatch(
      addCustomBroadcast({
        id: 'critical-tv',
        key: 'custom.critical-tv',
        phase: 'season_start',
        text: 'Critical copy',
        title: 'Critical title',
        type: 'game',
        level: 'critical',
        enabled: true,
        order: 40,
      })
    )
    store.dispatch(syncPhaseBroadcasts({ phase: 'season_start' }))

    render(
      <I18nContext.Provider value={TEST_I18N}>
        <Provider store={store}>
          <MemoryRouter>
            <TvZone />
          </MemoryRouter>
        </Provider>
      </I18nContext.Provider>
    )

    expect(screen.getByRole('region', { name: 'Live game events display' })).toHaveTextContent(
      'Plain faux TV'
    )
    expect(screen.queryByText('Log only')).not.toBeNull()

    let accepted = true
    act(() => {
      accepted = window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })
    expect(accepted).toBe(false)
    expect(store.getState().game.phase).toBe('season_start')
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Announcement: Major title/i })).toBeInTheDocument()
    })

    act(() => {
      accepted = window.dispatchEvent(new CustomEvent('ui:playPressed', { cancelable: true }))
    })
    expect(accepted).toBe(false)
    await waitFor(() => {
      expect(screen.getByTestId('tv-shock-prelude')).toHaveTextContent('Critical title')
    })
  })
})
