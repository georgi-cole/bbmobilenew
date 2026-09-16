import type { Middleware } from '@reduxjs/toolkit'
import { computeLeaderboardScore } from '../scoring/computeLeaderboard'
import { DEFAULT_WEIGHTS } from '../scoring/weights'
import type { GameState, Player } from '../types'
import { archiveSeason } from './gameSlice'
import type { PlayerSeasonSummary, SeasonArchive } from './seasonArchive'

type ResolutionState = {
  game: GameState
}

function deterministicTiebreak(seed: number, id: string): number {
  let hash = seed >>> 0
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash >>> 0
}

function baseSummary(player: Player, week: number): PlayerSeasonSummary {
  const lohWins = player.stats?.lohWins ?? 0
  const posWins = player.stats?.posWins ?? 0
  const timesNominated = player.stats?.timesNominated ?? 0
  const battleBackWins = player.stats?.battleBackWins ?? 0
  return {
    playerId: player.id,
    displayName: player.name,
    finalPlacement: player.finalRank ?? player.seasonPlacement ?? null,
    isEvicted: player.status === 'evicted' || player.status === 'jury',
    lohWins,
    posWins,
    compsWon: lohWins + posWins,
    timesNominated,
    noms: timesNominated,
    madeJury: player.status === 'jury',
    battleBackWins,
    survivedDoubleEviction: player.stats?.survivedDoubleEviction ? true : undefined,
    wonFinalHoh: player.stats?.wonFinalHoh ?? false,
    wonPublicFavorite: false,
    daysAlive: player.evictedAtWeek ?? week,
    weeksAlive: player.evictedAtWeek ?? week,
    titlesWon: [],
    leaderboardScore: 0,
  }
}

function buildResolvedArchive(game: GameState): SeasonArchive | null {
  const human = game.players.find((player) => player.isUser)
  if (game.mode === 'survival' || human?.status !== 'evicted') return null
  if ((game.seasonArchives ?? []).some((archive) => archive.seasonIndex === game.season)) return null

  const stillInGame = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
  if (stillInGame.length < 2) return null

  const baseById = new Map(
    game.players.map((player) => [player.id, baseSummary(player, game.week)] as const)
  )
  const rankedRemaining = [...stillInGame].sort((left, right) => {
    const leftSummary = baseById.get(left.id)!
    const rightSummary = baseById.get(right.id)!
    const scoreDiff =
      computeLeaderboardScore(rightSummary, DEFAULT_WEIGHTS) -
      computeLeaderboardScore(leftSummary, DEFAULT_WEIGHTS)
    if (scoreDiff !== 0) return scoreDiff
    return deterministicTiebreak(game.seed, right.id) - deterministicTiebreak(game.seed, left.id)
  })
  const projectedFinalWeek = game.week + Math.max(0, stillInGame.length - 2)
  const placementById = new Map(rankedRemaining.map((player, index) => [player.id, index + 1]))
  const tribunalSize = game.cfg?.jurySize ?? 7

  const summaries = game.players.map((player) => {
    const summary = { ...baseById.get(player.id)! }
    const simulatedPlacement = placementById.get(player.id)
    if (simulatedPlacement != null) {
      summary.finalPlacement = simulatedPlacement
      summary.isEvicted = simulatedPlacement > 2
      summary.madeJury = simulatedPlacement > 2 && simulatedPlacement <= tribunalSize + 2
      const projectedExitWeek =
        simulatedPlacement <= 2
          ? projectedFinalWeek
          : Math.max(game.week, projectedFinalWeek - (simulatedPlacement - 2))
      summary.daysAlive = projectedExitWeek
      summary.weeksAlive = projectedExitWeek
    }
    summary.leaderboardScore = computeLeaderboardScore(summary, DEFAULT_WEIGHTS)
    return summary
  })

  return {
    seasonIndex: game.season,
    seasonId: `season-${game.season}-${game.gameId ?? game.seed}-resolved`,
    endAt: new Date().toISOString(),
    summaryText: 'Season completed off-screen after the player was eliminated before the Tribunal.',
    playerSummaries: summaries,
    cupidArrowActivated: game.cupidArrow?.activatedSeason === game.season,
    voxPopuliActivated: game.voxPopuli?.activatedSeason === game.season,
    twinShockConsumed: game.twinShockConsumed === true,
  }
}

/**
 * Starting over after a pre-Tribunal eviction used to discard the unfinished
 * season, so the next run became Season 1 again and no winner reached history.
 * Resolve only that terminal branch into a compact deterministic archive before
 * resetGame runs. Normal in-season resets and completed finales are untouched.
 */
export const eliminatedSeasonResolutionMiddleware: Middleware = (api) => (next) => (action) => {
  if (
    typeof action === 'object' &&
    action !== null &&
    'type' in action &&
    (action as { type: string }).type === 'game/resetGame'
  ) {
    const archive = buildResolvedArchive((api.getState() as ResolutionState).game)
    if (archive) api.dispatch(archiveSeason(archive))
  }
  return next(action)
}
