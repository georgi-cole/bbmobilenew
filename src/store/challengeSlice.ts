// MODULE: src/store/challengeSlice.ts
// Orchestrates the full challenge flow:
//   pickGame → rules modal → 3s countdown → run game → compute scores → apply winner
//
// Uses the existing gameSlice actions (launchMinigame, completeMinigame, etc.)
// and the new minigame registry / scoring modules.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState, AppDispatch } from './store'
import { mulberry32 } from './rng'
import {
  getCompetitionSeasonState,
  getDefaultCompetitionProfile,
  getMinigameAiModelForGame,
  simulateMinigameAiScore,
} from '../ai/competition'
import { selectNextCompetitionGame } from '../ai/competition/scheduling'
import { getClassicCampaignPoolForContext } from '../ai/competition/bracketTemplate'
import { applyCompetitionSeasonUpdate, hydrateGame, selectAlivePlayers } from './gameSlice'
import {
  pickRandomGame,
  getGame,
  getPoolByFilter,
  supportsPlayerCount,
} from '../minigames/registry'
import type { GameRegistryEntry, GameCategory } from '../minigames/registry'
import { computeScores } from '../minigames/scoring'
import type { RawResult } from '../minigames/scoring'
import type { CwgoPrizeType } from '../features/cwgo/cwgoCompetitionSlice'
import { TWIN_SHOCK_LIA_ID } from '../bb/twinShock'
import type { MusicMinigameVariant } from '../services/sound/musicConfig'
import { rankPressurePlankResults } from '../components/PressurePlank/pressurePlankLogic'
import { resolveGameManagerRule } from '../gameManager/gameManager'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Simple DJB2 string hash, returns an unsigned 32-bit integer. */
function hashStringU32(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h
}

function shouldForceTwinShockHintGame(
  state: RootState,
  prizeType?: CwgoPrizeType | string
): boolean {
  const game = state.game
  const isLohChallenge = prizeType === 'LOH' || (prizeType == null && game.phase === 'loh_comp')
  return (
    isLohChallenge &&
    game.week === 5 &&
    game.twinShockResolution == null &&
    game.players.some((player) => player.id === TWIN_SHOCK_LIA_ID && player.status === 'active')
  )
}
// ─── State ────────────────────────────────────────────────────────────────────

export interface ChallengeRun {
  id: string
  gameKey: string
  seed: number
  participants: string[]
  /** Per-player raw values keyed by player ID. */
  rawScores: Record<string, number>
  /** Per-player canonical higher-is-better scores used for ranking; usually 0-1000, but unbounded raw games may exceed it. */
  canonicalScores: Record<string, number>
  ranking?: string[]
  winnerId: string
  timestamp: number
  /** Whether the winner was determined by the game authoritatively. */
  authoritative: boolean
  /** True when the human dismissed the challenge before it completed. */
  partial?: boolean
}

export interface ChallengeState {
  /** Currently pending challenge (shown to UI). */
  pending: PendingChallenge | null
  /** Telemetry log of completed runs (for reproducibility). */
  history: ChallengeRun[]
  /** Monotonically-increasing nonce used to differentiate per-invocation seeds. */
  nextNonce: number
  /** Debug overrides. */
  debug: {
    forceGameKey?: string
    forceSeed?: number
    skipRules?: boolean
    fastForwardCountdown?: boolean
  }
}

export interface PendingChallenge {
  /** Unique ID for this challenge invocation. */
  id: string
  game: GameRegistryEntry
  seed: number
  participants: string[]
  phase: 'rules' | 'countdown' | 'playing' | 'results' | 'done'
  musicVariant?: MusicMinigameVariant
  /** Pre-simulated deterministic scores for every non-human participant. */
  aiScores: Record<string, number>
  /**
   * Pre-simulated tiebreaker times (ms) for non-human participants.
   * Only populated for games whose AI model defines `tiebreakerMaxMs`.
   * Lower value = faster = better rank when canonical scores are equal.
   */
  aiTiebreakers?: Record<string, number>
  /** Prize type captured at challenge creation (LOH or POS). */
  prizeType?: CwgoPrizeType | string
  /** A valid producer-selected winner, resolved when this challenge was scheduled. */
  forcedWinnerId?: string
}

const initialState: ChallengeState = {
  pending: null,
  history: [],
  nextNonce: 1,
  debug: {},
}

const LATE_SEASON_PLAYER_THRESHOLD = 6
// Keep a modest history buffer in case the scheduler window expands.
const RECENT_HISTORY_LIMIT = 10

// ─── Slice ───────────────────────────────────────────────────────────────────

const challengeSlice = createSlice({
  name: 'challenge',
  initialState,
  reducers: {
    setPendingChallenge(state, action: PayloadAction<PendingChallenge | null>) {
      state.pending = action.payload
    },

    setPendingPhase(state, action: PayloadAction<PendingChallenge['phase']>) {
      if (state.pending) {
        state.pending.phase = action.payload
        if (action.payload !== 'playing') state.pending.musicVariant = 'normal'
      }
    },

    setPendingMusicVariant(state, action: PayloadAction<MusicMinigameVariant>) {
      if (state.pending) state.pending.musicVariant = action.payload
    },

    incrementNonce(state) {
      state.nextNonce = (state.nextNonce + 1) >>> 0 || 1
    },

    recordRun(state, action: PayloadAction<ChallengeRun>) {
      // Keep at most 50 runs for telemetry.
      state.history = [action.payload, ...state.history].slice(0, 50)
    },

    setDebugOverrides(state, action: PayloadAction<ChallengeState['debug']>) {
      state.debug = { ...state.debug, ...action.payload }
    },

    clearDebugOverrides(state) {
      state.debug = {}
    },
    hydrateChallenge(_state, action: PayloadAction<ChallengeState>) {
      const restored = action.payload
      return {
        ...restored,
        pending: restored.pending
          ? { ...restored.pending, phase: 'rules' as const, musicVariant: 'normal' as const }
          : null,
      }
    },
  },
  extraReducers: (builder) => {
    // A game reset always starts a distinct campaign. Keeping a pending
    // challenge is unsafe because player IDs are reused by the fresh roster,
    // allowing GameScreen to mount and resolve the previous campaign's
    // competition before the new campaign reaches a competition phase.
    builder.addMatcher(
      (action) => action.type === 'game/resetGame',
      () => ({ ...initialState, history: [], debug: {} })
    )
  },
})

export const {
  setPendingChallenge,
  setPendingPhase,
  setPendingMusicVariant,
  incrementNonce,
  recordRun,
  setDebugOverrides,
  clearDebugOverrides,
  hydrateChallenge,
} = challengeSlice.actions

export default challengeSlice.reducer

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectPendingChallenge = (s: RootState) => s.challenge?.pending ?? null
export const selectChallengeHistory = (s: RootState) => s.challenge?.history ?? []
export const selectChallengeDebug = (s: RootState) => s.challenge?.debug ?? {}

// ─── Thunks ───────────────────────────────────────────────────────────────────

/**
 * Pick a minigame from the registry (deterministically), set up the pending
 * challenge, and return the selected game entry.
 *
 * This does NOT start the rules modal; the UI component (MinigameHost) reads
 * `pending` from state and controls the modal/countdown itself.
 *
 * @param seed - Base seed for this challenge; per-game seed is derived from it.
 * @param participants - Player IDs that will compete.
 * @param opts.category - Optional category filter.
 * @param opts.excludeKeys - Games to exclude from the pool.
 * @param opts.prizeType - Prize type for CWGO competitions (LOH or POS).
 */
export const startChallenge =
  (
    seed: number,
    participants: string[],
    opts: {
      category?: GameCategory
      excludeKeys?: string[]
      forceGameKey?: string
      prizeType?: CwgoPrizeType | string
    } = {}
  ) =>
  (dispatch: AppDispatch, getState: () => RootState): GameRegistryEntry => {
    const state = getState()
    const debugState = state.challenge?.debug ?? {}

    // Resolve which game to use.
    const forceKey = opts.forceGameKey ?? debugState.forceGameKey
    const forceSeed = debugState.forceSeed
    const gameSeed = forceSeed !== undefined ? forceSeed : seed
    const nextNonce = state.challenge?.nextNonce ?? 1
    // Vary game selection by both run and invocation. Using only the season
    // seed made every Survival run follow the same apparent playlist.
    const selectionSeed =
      forceSeed !== undefined
        ? gameSeed
        : deriveSeed(
            (gameSeed ^ nextNonce) >>> 0,
            `${state.game.runId ?? state.game.gameId ?? 'game'}:${nextNonce}`
          )

    const allHistoryGameKeys = (state.challenge?.history ?? []).map((run) => run.gameKey)
    const historyGameKeys = allHistoryGameKeys.slice(0, RECENT_HISTORY_LIMIT)
    // Late-season bias is based on active competitors (jury members no longer play comps).
    const activeCompetitorCount = selectAlivePlayers(state).length
    const scheduledPlayerCount = participants.length || activeCompetitorCount
    const competitionType = opts.prizeType === 'POS' ? 'POS' : 'LOH'
    const managerConfig =
      state.remoteConfig?.config?.gameManager ?? state.settings?.gameUX?.gameManager
    const managerRule = resolveGameManagerRule(managerConfig, {
      day: state.game.week,
      playerCount: scheduledPlayerCount,
      competition: competitionType,
    })
    const eligibleForRoster = (game: GameRegistryEntry) =>
      supportsPlayerCount(game, scheduledPlayerCount)
    const lateSeasonBias =
      activeCompetitorCount > 0 && activeCompetitorCount <= LATE_SEASON_PLAYER_THRESHOLD
    const selectFromPool = (pool: GameRegistryEntry[]) =>
      selectNextCompetitionGame({
        seed: selectionSeed,
        games: pool,
        recentGameKeys: historyGameKeys,
        lateSeasonBias,
      })
    const pickFromRegistry = (category?: GameCategory, excludeKeys?: string[]) => {
      const pool = getPoolByFilter({ retired: false, category, excludeKeys }).filter(
        eligibleForRoster
      )
      if (pool.length > 0) return selectFromPool(pool)
      return pickRandomGame(gameSeed, { category, excludeKeys })
    }
    const pickSurvivorGame = (category?: GameCategory, excludeKeys?: string[]) => {
      const modeSpecific =
        state.game.modeSpecific?.kind === 'survival' ? state.game.modeSpecific : null
      if (!modeSpecific) return pickFromRegistry(category, excludeKeys)

      // Survivor has its own free-form rotation. The curated Classic campaign
      // map must not constrain it; only retirement, roster safety, explicit
      // exclusions, and an optional category filter apply.
      const availablePool = getPoolByFilter({ retired: false, excludeKeys }).filter(
        eligibleForRoster
      )
      const pool = category
        ? availablePool.filter((game) => game.category === category)
        : availablePool
      const selectionPool = pool.length > 0 ? pool : availablePool
      if (selectionPool.length === 0) {
        throw new Error('[challengeSlice] No non-retired Survival games are available')
      }

      const usedKeys = modeSpecific.competitionRotation.usedKeys ?? []
      const used = new Set(usedKeys)
      let available = selectionPool.filter((game) => !used.has(game.key))
      let nextUsedKeys = usedKeys
      let nextRound = modeSpecific.competitionRotation.round ?? 1

      if (available.length === 0) {
        available = selectionPool
        nextUsedKeys = []
        nextRound += 1
      }

      const selected = selectFromPool(available)
      dispatch(
        hydrateGame({
          ...state.game,
          modeSpecific: {
            ...modeSpecific,
            competitionRotation: {
              usedKeys: [...nextUsedKeys, selected.key],
              round: nextRound,
            },
          },
          lastPlayedAt: Date.now(),
        })
      )
      return selected
    }
    const getBracketTemplatePool = (excludeKeys?: string[]) => {
      const isFinal3Competition =
        state.game.phase === 'final3_comp1' ||
        state.game.phase === 'final3_comp1_minigame' ||
        state.game.phase === 'final3_comp2' ||
        state.game.phase === 'final3_comp2_minigame' ||
        state.game.phase === 'final3_comp3' ||
        state.game.phase === 'final3_comp3_minigame'
      const bracketCompType =
        opts.prizeType === 'LOH' || opts.prizeType === 'POS'
          ? opts.prizeType
          : isFinal3Competition
            ? 'LOH'
            : undefined
      if (!bracketCompType) return []

      const bracketPlayerCount =
        activeCompetitorCount > 0 ? activeCompetitorCount : participants.length
      const bracketKeys = getClassicCampaignPoolForContext({
        day: state.game.week,
        playerCount: bracketPlayerCount,
        compType: bracketCompType,
        phase: state.game.phase,
        playedGameKeys: allHistoryGameKeys,
      })
      if (bracketKeys.length === 0) return []

      const excluded = new Set(excludeKeys ?? [])
      return bracketKeys
        .map((k) => getGame(k))
        .filter(
          (g): g is GameRegistryEntry =>
            g !== undefined && !g.retired && !excluded.has(g.key) && eligibleForRoster(g)
        )
    }

    let gameEntry: GameRegistryEntry
    if (forceKey) {
      const found = getGame(forceKey)
      if (!found) throw new Error(`[challengeSlice] Unknown game key: ${forceKey}`)
      gameEntry = found
    } else if (managerRule?.selection === 'game') {
      const configured = managerRule.gameKey ? getGame(managerRule.gameKey) : undefined
      gameEntry =
        configured && !configured.retired && eligibleForRoster(configured)
          ? configured
          : pickFromRegistry()
    } else if (managerRule?.selection === 'category' && managerRule.category) {
      gameEntry = pickFromRegistry(managerRule.category)
    } else if (state.game.mode === 'survival') {
      gameEntry = pickSurvivorGame(opts.category, opts.excludeKeys)
    } else {
      // Remote live-config weekly mode takes priority over user settings.
      const remoteChallenge = state.remoteConfig?.config?.challenge
      // Consult the saved Comp Selection setting as a fallback.
      const compSel = state.settings?.gameUX?.compSelection
      const mode = remoteChallenge?.weeklyMode ?? compSel?.mode ?? 'unique'

      switch (mode) {
        case 'single-game': {
          // Remote key takes priority over the user's selectedGameId.
          const key = remoteChallenge?.weeklyGameKey ?? compSel?.selectedGameId
          const found = key ? getGame(key) : undefined
          if (found && eligibleForRoster(found)) {
            gameEntry = found
          } else {
            // Unknown or missing key — fall back to random selection.
            gameEntry = pickFromRegistry(opts.category, opts.excludeKeys)
          }
          break
        }

        case 'user-selection': {
          // Remote weeklyGameKeys pool takes priority over the user's selectedGameIds.
          const keys = remoteChallenge?.weeklyGameKeys ?? compSel?.selectedGameIds ?? []
          const pool = keys
            .map((k) => getGame(k))
            .filter(
              (g): g is GameRegistryEntry => g !== undefined && !g.retired && eligibleForRoster(g)
            )
          if (pool.length > 0) {
            gameEntry = selectFromPool(pool)
          } else {
            gameEntry = pickFromRegistry(opts.category, opts.excludeKeys)
          }
          break
        }

        case 'arcade-only':
          gameEntry = pickFromRegistry('arcade', opts.excludeKeys)
          break

        case 'trivia-only':
          gameEntry = pickFromRegistry('trivia', opts.excludeKeys)
          break

        case 'endurance-only':
          gameEntry = pickFromRegistry('endurance', opts.excludeKeys)
          break

        case 'logic-only':
          gameEntry = pickFromRegistry('logic', opts.excludeKeys)
          break

        case 'retired': {
          const retiredPool = getPoolByFilter({ retired: true })
          if (retiredPool.length > 0) {
            gameEntry = selectFromPool(retiredPool)
          } else {
            gameEntry = pickFromRegistry(opts.category, opts.excludeKeys)
          }
          break
        }

        case 'misc': {
          // "Misc" — intended for games with no category or multiple categories.
          // The registry currently assigns a single GameCategory to every entry
          // (there is no 'none' or 'misc' category), so this mode currently falls
          // back to the standard scheduler-based selection via pickFromRegistry.
          // Future registry expansions that add uncategorised entries should filter
          // them here with getPoolByFilter instead of using the scheduler.
          gameEntry = pickFromRegistry(opts.category, opts.excludeKeys)
          break
        }

        case 'unique': {
          const recentKeys = new Set(historyGameKeys)
          const seasonUsedKeys = new Set(allHistoryGameKeys)
          const bracketPool = getBracketTemplatePool(opts.excludeKeys)
          // Classic campaign selection is without replacement across both LOH
          // and POS. Only repeat after every game in the current eligible pool
          // has already appeared this season.
          const uniqueBracketPool = bracketPool.filter((game) => !seasonUsedKeys.has(game.key))
          if (uniqueBracketPool.length > 0) {
            gameEntry = selectFromPool(uniqueBracketPool)
            break
          }
          if (bracketPool.length > 0) {
            gameEntry = selectFromPool(bracketPool)
            break
          }

          const exclude = Array.from(new Set([...recentKeys, ...(opts.excludeKeys ?? [])]))
          const uniquePool = getPoolByFilter({
            retired: false,
            category: opts.category,
            excludeKeys: exclude,
          }).filter(eligibleForRoster)
          if (uniquePool.length > 0) {
            gameEntry = selectFromPool(uniquePool)
          } else {
            gameEntry = pickFromRegistry(opts.category, opts.excludeKeys)
          }
          break
        }

        case 'bracket-template': {
          const bracketPool = getBracketTemplatePool(opts.excludeKeys)
          if (bracketPool.length > 0) {
            const seasonUsedKeys = new Set(allHistoryGameKeys)
            const unusedPool = bracketPool.filter((game) => !seasonUsedKeys.has(game.key))
            gameEntry = selectFromPool(unusedPool.length > 0 ? unusedPool : bracketPool)
            break
          }
          gameEntry = pickFromRegistry(opts.category, opts.excludeKeys)
          break
        }

        case 'random-games':
        default:
          gameEntry = pickFromRegistry(opts.category, opts.excludeKeys)
          break
      }
    }

    if (shouldForceTwinShockHintGame(state, opts.prizeType)) {
      const twinHintGame = getGame('castleRescue')
      if (twinHintGame) gameEntry = twinHintGame
    }
    // Derive a per-challenge seed from the base seed + game key hash.
    const challengeSeed = deriveSeed(gameSeed, gameEntry.key)

    // Derive a per-invocation seed so repeated challenges with the same base
    // seed (same week) still get varied question order / AI behaviour.
    // debug.forceSeed bypasses this for reproducibility.
    const perChallengeSeed =
      forceSeed !== undefined
        ? challengeSeed
        : (mulberry32((challengeSeed ^ nextNonce) >>> 0)() * 0x100000000) >>> 0
    dispatch(incrementNonce())

    const latestState = getState()
    const gameState = latestState.game
    const resolvedParticipants =
      gameState.mode === 'survival'
        ? selectAlivePlayers(latestState)
            .slice(
              0,
              gameState.modeSpecific?.kind === 'survival'
                ? gameState.modeSpecific.startingCastSize
                : 8
            )
            .map((player) => player.id)
        : participants

    const isLohChallenge =
      opts.prizeType === 'LOH' || (opts.prizeType == null && gameState.phase === 'loh_comp')
    const eligibleParticipants =
      isLohChallenge && gameState.prevHohId
        ? resolvedParticipants.filter((id) => id !== gameState.prevHohId)
        : resolvedParticipants
    const finalParticipants =
      eligibleParticipants.length > 0 ? eligibleParticipants : resolvedParticipants
    const forcedWinnerId =
      managerRule?.outcome === 'player' &&
      managerRule.winnerId &&
      finalParticipants.includes(managerRule.winnerId)
        ? managerRule.winnerId
        : managerRule?.outcome === 'random' && finalParticipants.length > 0
          ? finalParticipants[
              Math.floor(
                mulberry32((selectionSeed ^ 0x6d2b79f5) >>> 0)() * finalParticipants.length
              )
            ]
          : undefined

    // Pre-compute AI scores for all non-human participants.
    const humanId = gameState?.players?.find((p) => p.isUser)?.id
    const aiScores: Record<string, number> = {}
    const minigameModel = getMinigameAiModelForGame(gameEntry)
    const timeLimitMs = gameEntry.timeLimitMs > 0 ? gameEntry.timeLimitMs : undefined
    finalParticipants.forEach((pid, index) => {
      if (pid !== humanId) {
        const player = gameState?.players?.find((p) => p.id === pid)
        aiScores[pid] = simulateMinigameAiScore({
          gameKey: gameEntry.key,
          minigameModel,
          seed: perChallengeSeed,
          playerId: pid,
          participantIndex: index,
          profile: player?.competitionProfile ?? getDefaultCompetitionProfile(),
          seasonState: getCompetitionSeasonState(gameState?.competitionSeasonStateByPlayerId, pid),
          timeLimitMs,
          timeLimitSeconds: timeLimitMs ? timeLimitMs / 1000 : undefined,
        })
      }
    })

    // Pre-compute AI tiebreakers for games whose model defines tiebreakerMaxMs.
    // Better score → shorter simulated elapsed time; includes minor RNG jitter.
    let aiTiebreakers: Record<string, number> | undefined
    if (typeof minigameModel.tiebreakerMaxMs === 'number' && minigameModel.tiebreakerMaxMs > 0) {
      const minScore = minigameModel.minScore ?? 0
      const maxScore = minigameModel.maxScore ?? 100
      const scoreRange = Math.max(1, maxScore - minScore)
      const maxMs = minigameModel.tiebreakerMaxMs
      aiTiebreakers = {}
      finalParticipants.forEach((pid) => {
        if (pid === humanId || aiScores[pid] == null) return
        // Seed the jitter RNG differently from the score RNG by XOR-ing a fixed salt.
        const rng = mulberry32(
          ((perChallengeSeed >>> 0) ^ (hashStringU32(pid) ^ 0xbeef_cafe)) >>> 0
        )
        const normalizedScore = Math.max(0, Math.min(1, (aiScores[pid] - minScore) / scoreRange))
        // jitter in [-0.1, +0.1] of maxMs
        const jitter = (rng() - 0.5) * 0.2 * maxMs
        // Better score → fraction closer to 0.15 (fast); worse score → closer to 0.95 (slow)
        const fraction = 0.15 + (1 - normalizedScore) * 0.8
        aiTiebreakers![pid] = Math.round(
          Math.max(maxMs * 0.05, Math.min(maxMs * 0.99, fraction * maxMs + jitter))
        )
      })
    }

    const id = `challenge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const pending: PendingChallenge = {
      id,
      game: gameEntry,
      seed: perChallengeSeed,
      participants: finalParticipants,
      phase: 'rules',
      musicVariant: 'normal',
      aiScores,
      aiTiebreakers,
      prizeType: opts.prizeType,
      forcedWinnerId,
    }

    dispatch(setPendingChallenge(pending))
    return gameEntry
  }

/**
 * Complete the current challenge with the raw results from each participant.
 * Computes canonical scores, determines the winner, and records telemetry.
 *
 * Returns the winner's player ID.
 */
export const completeChallenge =
  (
    rawResults: RawResult[],
    options?: {
      authoritativeWinnerId?: string | null
      partial?: boolean
    }
  ) =>
  (dispatch: AppDispatch, getState: () => RootState): string | null => {
    const state = getState()
    const pending = state.challenge?.pending
    if (!pending) return null

    const { game, seed, participants } = pending

    const ranked =
      game.key === 'pressurePlank'
        ? rankPressurePlankResults(
            participants,
            Object.fromEntries(rawResults.map((result) => [result.playerId, result.rawValue])),
            seed
          ).map((result) => ({
            ...(rawResults.find((raw) => raw.playerId === result.playerId) ?? {
              playerId: result.playerId,
              rawValue: result.survivalSeconds,
            }),
            rawValue: result.survivalSeconds,
            score: result.survivalSeconds,
            points: Math.round(result.survivalSeconds),
            rank: result.rank,
          }))
        : computeScores(game.scoringAdapter, rawResults, game.scoringParams ?? {})

    const canonicalScores: Record<string, number> = {}
    for (const r of ranked) canonicalScores[r.playerId] = r.score

    // Guard: prefer a winner with a positive canonical score. If all scored <= 0,
    // fall back to the first ranked entry, then the first participant.
    const positiveWinner = ranked.find((r) => r.score > 0)
    const winner = positiveWinner ?? ranked[0]
    const explicitWinnerId =
      game.key !== 'pressurePlank' &&
      options?.authoritativeWinnerId &&
      participants.includes(options.authoritativeWinnerId)
        ? options.authoritativeWinnerId
        : null
    const scheduledWinnerId =
      pending.forcedWinnerId && participants.includes(pending.forcedWinnerId)
        ? pending.forcedWinnerId
        : null
    const winnerId =
      scheduledWinnerId ?? explicitWinnerId ?? winner?.playerId ?? participants[0] ?? ''

    const run: ChallengeRun = {
      id: pending.id,
      gameKey: game.key,
      seed,
      participants,
      rawScores: Object.fromEntries(rawResults.map((r) => [r.playerId, r.rawValue])),
      canonicalScores,
      ranking: ranked.map((result) => result.playerId),
      winnerId,
      timestamp: Date.now(),
      authoritative:
        game.key === 'pressurePlank' ||
        scheduledWinnerId !== null ||
        explicitWinnerId !== null ||
        winner?.authoritativeWinner === true,
      partial: options?.partial === true,
    }

    dispatch(recordRun(run))
    if (scheduledWinnerId || explicitWinnerId) {
      // An authoritative React minigame winner may not align with the generic
      // challenge-score ranking, so apply only the winner boost here and avoid
      // placement bonuses based on fallback scores.
      dispatch(
        applyCompetitionSeasonUpdate({
          participants,
          winnerId,
          includePlacementBonuses: false,
        })
      )
    } else {
      dispatch(
        applyCompetitionSeasonUpdate({
          participants,
          scores: canonicalScores,
          winnerId,
          includePlacementBonuses: true,
        })
      )
    }
    dispatch(setPendingChallenge(null))

    return winnerId
  }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a deterministic seed from a base seed and a string key. */
function deriveSeed(base: number, key: string): number {
  let hash = base
  for (let i = 0; i < key.length; i++) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 0x9e3779b9) >>> 0
  }
  return (mulberry32(hash)() * 0x100000000) >>> 0
}
