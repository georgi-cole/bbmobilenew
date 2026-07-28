/**
 * Redux middleware for one-shot audio events.
 *
 * Background music is resolved independently by AudioStateSync. This module
 * translates domain actions into semantic event ids, then resolves their sound
 * cue from the effective music configuration (bundled < remote < local admin).
 */

import type { Middleware } from '@reduxjs/toolkit'
import type { RootState } from './store'
import { SoundManager } from '../services/sound/SoundManager'
import {
  resolveAudioEventCue,
  type AudioEventId,
} from '../services/sound/musicConfig'
import { selectEffectiveMusicConfig } from '../services/sound/musicRuntimeConfig'

interface BattleBackInfo {
  used: boolean
  winnerId: string | null
}

const LOH_MUSIC_PHASES = new Set<string>([
  'loh_comp',
  'loh_results',
  'pos_comp',
  'pos_results',
])

const PASSIVE_PHASES = new Set<string>([
  'nominations',
  'nomination_results',
  'pos_ceremony',
  'pos_ceremony_results',
  'live_vote',
])

/** Last eviction id whose reveal cue was emitted; reset when the overlay closes. */
let _lastEvictionSfxId: string | null = null

function isBattleBackReturn(
  battleBack: BattleBackInfo | null | undefined,
  playerId: string
): boolean {
  return battleBack?.used === true && battleBack?.winnerId === playerId
}

function playConfiguredEvent(eventId: AudioEventId, state: RootState): void {
  const cue = resolveAudioEventCue(eventId, selectEffectiveMusicConfig(state))
  if (!cue.soundKey) return
  const options = cue.volume === undefined ? undefined : { volume: cue.volume }
  void SoundManager.play(cue.soundKey, options)
}

/** Phase entry owns only the competition-results stinger; mounted visuals own the rest. */
function applyPhaseAudio(newPhase: string, state: RootState): void {
  if (LOH_MUSIC_PHASES.has(newPhase)) {
    if (newPhase === 'loh_results' || newPhase === 'pos_results') {
      playConfiguredEvent('competition.results', state)
    }
    return
  }

  if (PASSIVE_PHASES.has(newPhase)) return

  // Eviction audio is emitted when the reveal overlay actually opens, not when
  // the phase changes, so it never plays ahead of the vote-reveal sequence.
}

export const soundMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) {
    return next(action)
  }

  const { type } = action as { type: string }

  if (type === 'game/advance') {
    const result = next(action)
    const state = api.getState() as RootState
    applyPhaseAudio(state.game.phase, state)
    return result
  }

  if (type === 'game/setPhase' || type === 'game/forcePhase') {
    const newPhase = (action as { type: string; payload: string }).payload
    const result = next(action)
    applyPhaseAudio(newPhase, api.getState() as RootState)
    return result
  }

  if (type === 'game/completeMinigame') {
    const result = next(action)
    playConfiguredEvent('minigame.results', api.getState() as RootState)
    return result
  }

  if (type === 'game/applyMinigameWinner') {
    const result = next(action)
    playConfiguredEvent('minigame.winner', api.getState() as RootState)
    return result
  }

  if (type === 'game/skipMinigame') {
    const result = next(action)
    playConfiguredEvent('minigame.skipped', api.getState() as RootState)
    return result
  }

  if (type === 'game/submitHumanVote') {
    const result = next(action)
    playConfiguredEvent('eviction.vote-cast', api.getState() as RootState)
    return result
  }

  if (type === 'game/submitPovSaveTarget') {
    const result = next(action)
    playConfiguredEvent('safety.decision', api.getState() as RootState)
    return result
  }

  if (type === 'game/activateBattleBack') {
    const result = next(action)
    playConfiguredEvent('twist.battle-back', api.getState() as RootState)
    return result
  }

  if (type === 'game/setEvictionOverlay') {
    const previousState = api.getState() as RootState
    const previousOverlayId = previousState.game.evictionOverlayPlayerId ?? null
    const newId = (action as { type: string; payload: string | null }).payload
    const result = next(action)

    if (
      newId !== null &&
      newId !== undefined &&
      previousOverlayId === null &&
      newId !== _lastEvictionSfxId &&
      !isBattleBackReturn(previousState.game.battleBack, newId)
    ) {
      _lastEvictionSfxId = newId
      playConfiguredEvent('eviction.reveal', api.getState() as RootState)
    }

    if (newId === null) _lastEvictionSfxId = null
    return result
  }

  if (type === 'game/clearEvictionOverlay') {
    const result = next(action)
    _lastEvictionSfxId = null
    return result
  }

  if (type === 'game/resetGame') {
    const result = next(action)
    _lastEvictionSfxId = null
    return result
  }

  if (type === 'finale/castVote') {
    const result = next(action)
    playConfiguredEvent('tribunal.vote', api.getState() as RootState)
    return result
  }

  if (type === 'game/startWinnerCinematic') {
    const result = next(action)
    playConfiguredEvent('finale.winner', api.getState() as RootState)
    return result
  }

  return next(action)
}
