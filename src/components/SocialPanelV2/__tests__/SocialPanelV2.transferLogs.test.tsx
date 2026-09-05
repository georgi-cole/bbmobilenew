/**
 * Tests for SocialPanelV2 session log transfer on close.
 *
 * Covers:
 *  1. Closing the panel when sessionLogs exist dispatches exactly ONE concise diary
 *     summary entry to game.tvFeed (not one entry per action).
 *  2. The diary summary entry has type 'diary'.
 *  3. The diary summary entry text includes the week and outcome counts.
 *  4. social.sessionLogs are cleared after the panel is closed.
 *  5. No diary entry is added when sessionLogs is empty on close.
 *  6. Multiple session logs (3) still produce only ONE summary diary entry.
 *  7. Closing does not fabricate an extra generic TV event.
 *  8. The causal Diary Room summary replaces preset close chatter.
 *  9. No 'social' type TV event is dispatched when sessionLogs is empty on close.
 * 10. AI-initiated logs (actorId !== humanId) are not written as diary entries.
 * 11. The summary diary entry has source: 'manual' and channels: ['dr'].
 * 12. The summary stays private to the Diary Room channel.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router'
import { configureStore } from '@reduxjs/toolkit'
import gameReducer from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import socialReducer, { openSocialPanel, recordSocialAction } from '../../../social/socialSlice'
import { initManeuvers } from '../../../social/SocialManeuvers'
import SocialPanelV2 from '../SocialPanelV2'
import type { RootState } from '../../../store/store'

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  const base = configureStore({ reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer } })
  const defaultState = base.getState() as RootState
  const store = configureStore({
    reducer: { game: gameReducer, social: socialReducer, settings: settingsReducer },
    preloadedState: {
      game: { ...defaultState.game, phase: 'social_1' as RootState['game']['phase'] },
      social: defaultState.social,
      settings: defaultState.settings,
    },
  })
  initManeuvers(store)
  return store
}

function renderPanel(store: ReturnType<typeof makeStore>) {
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <SocialPanelV2 />
      </Provider>
    </MemoryRouter>
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SocialPanelV2 – session log transfer on close', () => {
  let store: ReturnType<typeof makeStore>
  let humanId: string
  let otherPlayerId: string

  beforeEach(() => {
    store = makeStore()
    const players = store.getState().game.players
    humanId = players.find((p) => p.isUser)!.id
    otherPlayerId = players.find((p) => !p.isUser)!.id
    store.dispatch(openSocialPanel())
  })

  it('adds exactly one summary diary entry to tvFeed when sessionLogs exist on close', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )

    renderPanel(store)
    const diaryCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const diaryCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length
    // Exactly one summary diary entry regardless of session log count.
    expect(diaryCountAfter).toBe(diaryCountBefore + 1)
  })

  it('diary entry has type "diary"', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )

    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const feed = store.getState().game.tvFeed
    const diaryEntry = feed.find((e) => e.type === 'diary')
    expect(diaryEntry).toBeDefined()
    expect(diaryEntry!.type).toBe('diary')
  })

  it('diary entry text includes week and outcome counts', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )

    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const feed = store.getState().game.tvFeed
    const diaryEntry = feed.find((e) => e.type === 'diary')
    expect(diaryEntry).toBeDefined()
    expect(diaryEntry!.text).toContain('Day')
    expect(diaryEntry!.text).toContain('success')
  })

  it('clears social.sessionLogs after close', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )

    renderPanel(store)
    expect(store.getState().social.sessionLogs.length).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    expect(store.getState().social.sessionLogs.length).toBe(0)
  })

  it('does not add a diary entry when sessionLogs is empty on close', () => {
    renderPanel(store)
    const diaryCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const diaryCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length
    expect(diaryCountAfter).toBe(diaryCountBefore)
  })

  it('multiple session logs produce exactly ONE summary diary entry', () => {
    for (let i = 0; i < 3; i++) {
      store.dispatch(
        recordSocialAction({
          entry: {
            actionId: 'compliment',
            actorId: humanId,
            targetId: otherPlayerId,
            cost: 1,
            delta: 2,
            outcome: 'success',
            newEnergy: 4 - i,
            timestamp: Date.now() + i,
          },
        })
      )
    }

    renderPanel(store)
    const diaryCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const diaryCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length
    // 3 session logs → ONE summary diary entry (not 3 individual entries).
    expect(diaryCountAfter).toBe(diaryCountBefore + 1)
  })

  it('does not fabricate a social TV event just because the panel closed', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )

    renderPanel(store)
    const socialCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'social').length

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const socialCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'social').length
    expect(socialCountAfter).toBe(socialCountBefore)
  })

  it('uses the causal diary summary instead of preset close chatter', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )

    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const socialEntry = store.getState().game.tvFeed.find((e) => e.type === 'social')
    const diaryEntry = store.getState().game.tvFeed.find((e) => e.type === 'diary')
    expect(socialEntry).toBeUndefined()
    expect(diaryEntry?.text).toContain('social action')
  })

  it('does not dispatch a social type TV event when sessionLogs is empty on close', () => {
    renderPanel(store)
    const socialCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'social').length

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const socialCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'social').length
    expect(socialCountAfter).toBe(socialCountBefore)
  })

  it('AI-initiated logs are not written as diary entries and do not trigger a social TV event', () => {
    const aiPlayer = store.getState().game.players.find((p) => !p.isUser && p.id !== otherPlayerId)
    expect(aiPlayer).toBeDefined()
    const aiPlayerId = aiPlayer!.id
    // Record a log where an AI player is the actor (not the human)
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: aiPlayerId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 3,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )

    renderPanel(store)
    const diaryCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length
    const socialCountBefore = store.getState().game.tvFeed.filter((e) => e.type === 'social').length

    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    // No diary entry and no social TV message — the only actor is AI, not the human player.
    const diaryCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'diary').length
    const socialCountAfter = store.getState().game.tvFeed.filter((e) => e.type === 'social').length
    expect(diaryCountAfter).toBe(diaryCountBefore)
    expect(socialCountAfter).toBe(socialCountBefore)
  })

  it('summary diary entry has source "manual" and channels ["dr"]', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )

    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const diaryEntry = store.getState().game.tvFeed.find((e) => e.type === 'diary')
    expect(diaryEntry).toBeDefined()
    expect(diaryEntry!.source).toBe('manual')
    expect(diaryEntry!.channels).toContain('dr')
  })

  it('keeps the close summary on the Diary Room channel', () => {
    store.dispatch(
      recordSocialAction({
        entry: {
          actionId: 'compliment',
          actorId: humanId,
          targetId: otherPlayerId,
          cost: 1,
          delta: 5,
          outcome: 'success',
          newEnergy: 4,
          timestamp: Date.now(),
        },
      })
    )

    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: 'Close social panel' }))

    const diaryEntry = store.getState().game.tvFeed.find((e) => e.type === 'diary')
    expect(diaryEntry).toBeDefined()
    expect(diaryEntry!.channels).toEqual(['dr'])
  })
})
