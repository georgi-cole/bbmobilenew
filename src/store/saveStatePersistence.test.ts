import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearLastSavePersistenceIssue,
  CORRUPT_SAVE_RECOVERY_KEY,
  createSavedSeasonSnapshot,
  getLastSavePersistenceIssue,
  loadSavedRunProfile,
  markSurvivorAchievementCelebrationSeen,
  saveRunSnapshot,
  savedRunsKeyForProfile,
  type SavedSeasonSnapshot,
  type SavedSeasonState,
} from './saveStatePersistence'

describe('saveStatePersistence survivor progression', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearLastSavePersistenceIssue()
  })

  afterEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    clearLastSavePersistenceIssue()
  })

  it('quarantines a damaged run and reports a visible recovery event', () => {
    const key = savedRunsKeyForProfile('profile-1')
    localStorage.setItem(key, '{damaged-json')

    const profile = loadSavedRunProfile('profile-1')

    expect(profile.runs).toEqual({})
    expect(localStorage.getItem(key)).toBeNull()
    expect(sessionStorage.getItem(CORRUPT_SAVE_RECOVERY_KEY)).toBe('{damaged-json')
    expect(getLastSavePersistenceIssue()?.kind).toBe('corrupt_recovered')
  })

  it('normalizes missing survivor achievement unlock maps to an empty object', () => {
    localStorage.setItem(
      savedRunsKeyForProfile('profile-1'),
      JSON.stringify({
        version: 2,
        profileId: 'profile-1',
        savedAt: '2026-07-01T00:00:00.000Z',
        activeRunId: null,
        lastPlayedRunId: null,
        runs: {},
        stats: {
          maxSurvivorDaysSurvived: 37,
        },
      })
    )

    expect(loadSavedRunProfile('profile-1').stats.survivorAchievementsUnlocked).toEqual({})
  })

  it('persists survivor unlocks and marks their celebration as seen', () => {
    const snapshot = {
      version: 1,
      profileId: 'profile-1',
      savedAt: '2026-07-01T12:00:00.000Z',
      game: {
        mode: 'survival',
        week: 25,
        status: 'active',
        runId: 'run-1',
        gameId: 'game-1',
        players: [
          { id: 'user', name: 'You', avatar: '🙂', status: 'active', isUser: true },
          { id: 'ai-1', name: 'AI 1', avatar: 'A', status: 'active' },
          { id: 'ai-2', name: 'AI 2', avatar: 'B', status: 'active' },
        ],
        modeSpecific: {
          kind: 'survival',
          currentDay: 25,
          bestDayReached: 25,
          startingCastSize: 9,
          totalRoboContestantsEvicted: 0,
          nextRoboIndex: 0,
        },
      },
      finale: {},
      social: {},
    } as SavedSeasonSnapshot

    expect(saveRunSnapshot('profile-1', snapshot)).toBe(true)

    const afterUnlock = loadSavedRunProfile('profile-1')
    expect(afterUnlock.stats.maxSurvivorDaysSurvived).toBe(25)
    expect(Object.keys(afterUnlock.stats.survivorAchievementsUnlocked)).toEqual([
      'survivor-day-10',
      'survivor-day-25',
    ])
    expect(afterUnlock.stats.survivorAchievementsUnlocked['survivor-day-25'].celebrationSeen).toBe(
      false
    )

    expect(markSurvivorAchievementCelebrationSeen('profile-1', 'survivor-day-25')).toBe(true)
    expect(
      loadSavedRunProfile('profile-1').stats.survivorAchievementsUnlocked['survivor-day-25']
        .celebrationSeen
    ).toBe(true)
  })

  it('keeps Classic, Surveyeval, Cupid, and Vox Populi in independent save slots', () => {
    const makeSnapshot = (
      runId: string,
      mode: 'classic' | 'survival',
      expansionMode: 'cupidArrow' | 'voxPopuli' | null
    ) =>
      ({
        version: 1,
        profileId: 'profile-1',
        savedAt: `2026-07-01T12:00:0${runId.length}.000Z`,
        game: {
          mode,
          expansionMode,
          week: 2,
          status: 'active',
          runId,
          gameId: runId,
          players: [{ id: 'user', name: 'You', avatar: 'P', status: 'active', isUser: true }],
        },
        finale: {},
        social: {},
      }) as SavedSeasonSnapshot

    expect(saveRunSnapshot('profile-1', makeSnapshot('classic-run', 'classic', null))).toBe(true)
    expect(saveRunSnapshot('profile-1', makeSnapshot('survival-run', 'survival', null))).toBe(true)
    expect(saveRunSnapshot('profile-1', makeSnapshot('cupid-run', 'classic', 'cupidArrow'))).toBe(
      true
    )
    expect(saveRunSnapshot('profile-1', makeSnapshot('vox-run', 'classic', 'voxPopuli'))).toBe(true)

    const runs = loadSavedRunProfile('profile-1').runs
    expect(runs.classic?.game.runId).toBe('classic-run')
    expect(runs.survival?.game.runId).toBe('survival-run')
    expect(runs.cupidArrow?.game.runId).toBe('cupid-run')
    expect(runs.voxPopuli?.game.runId).toBe('vox-run')
  })

  it('prepares one complete campaign snapshot without independently persisted authoring data', () => {
    const snapshot = createSavedSeasonSnapshot(
      'profile-1',
      {
        game: {
          mode: 'classic',
          phase: 'loh_results',
          status: 'active',
          week: 1,
          players: [],
          seasonArchives: [{ seasonIndex: 1, seasonId: 'season-1', playerSummaries: [] }],
          broadcastOverrides: { 'loh.winner': { text: 'Custom copy' } },
          customBroadcasts: [],
        },
        finale: { winnerId: 'player-1' },
        social: { actionLog: [] },
        publicOpinion: { feed: [] },
        challenge: { pending: null, history: [], nextNonce: 2, debug: {} },
      } as unknown as SavedSeasonState,
      '2026-08-09T10:00:00.000Z'
    )

    expect(snapshot).toMatchObject({
      profileId: 'profile-1',
      savedAt: '2026-08-09T10:00:00.000Z',
      game: {
        mode: 'classic',
        phase: 'loh_results',
        saveVersion: 2,
        lastPlayedAt: Date.parse('2026-08-09T10:00:00.000Z'),
      },
      finale: { winnerId: 'player-1' },
      social: { actionLog: [] },
      publicOpinion: { feed: [] },
      challenge: { pending: null, history: [], nextNonce: 2, debug: {} },
    })
    expect(snapshot.game).not.toHaveProperty('seasonArchives')
    expect(snapshot.game).not.toHaveProperty('broadcastOverrides')
    expect(snapshot.game).not.toHaveProperty('customBroadcasts')
  })

  it('saves a resumable LOH result even when runtime data contains a circular reference', () => {
    const runtimeData: Record<string, unknown> = { label: 'leader result' }
    runtimeData.self = runtimeData
    const snapshot = {
      version: 1,
      profileId: 'profile-1',
      savedAt: '2026-08-09T10:00:00.000Z',
      game: {
        mode: 'classic',
        phase: 'loh_results',
        status: 'active',
        week: 1,
        runId: 'run-1',
        gameId: 'game-1',
        players: [{ id: 'player-1', name: 'Player', avatar: 'P', status: 'loh', isUser: true }],
        runtimeData,
      },
      finale: {},
      social: {},
    } as unknown as SavedSeasonSnapshot

    expect(saveRunSnapshot('profile-1', snapshot)).toBe(true)
    expect(getLastSavePersistenceIssue()).toBeNull()

    const restoredGame = loadSavedRunProfile('profile-1').runs.classic?.game as unknown as {
      phase: string
      runtimeData: { label: string; self?: unknown }
    }
    expect(restoredGame.phase).toBe('loh_results')
    expect(restoredGame.runtimeData).toEqual({ label: 'leader result' })
  })
})
