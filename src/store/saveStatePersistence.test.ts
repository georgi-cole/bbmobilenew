import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  activateFiniteSeasonRun,
  clearLastSavePersistenceIssue,
  clearSavedRunProfile,
  CORRUPT_SAVE_RECOVERY_KEY,
  createSavedSeasonSnapshot,
  getFiniteSeasonRunChoices,
  getLastSavePersistenceIssue,
  loadSavedRunProfile,
  markSurvivorAchievementCelebrationSeen,
  saveRunSnapshot,
  saveSeasonSnapshot,
  savedRunSlotKeyForProfile,
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
    vi.restoreAllMocks()
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

  it('keeps one visible finite season while Surveyeval stays independent', () => {
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
    expect(saveRunSnapshot('profile-1', makeSnapshot('cupid-run', 'classic', 'cupidArrow'))).toBe(true)

    const profile = loadSavedRunProfile('profile-1')
    expect(profile.activeSeasonSlot).toBe('cupidArrow')
    expect(profile.retiredFiniteSlots).toEqual(['classic'])
    expect(profile.runs.survival?.game.runId).toBe('survival-run')
    expect(profile.runs.cupidArrow?.game.runId).toBe('cupid-run')
    expect(profile.runs.classic).toBeUndefined()
    expect(localStorage.getItem(savedRunSlotKeyForProfile('profile-1', 'classic'))).not.toBeNull()
  })

  it('lets an old multi-finite profile choose the season to keep live', () => {
    const makeSnapshot = (runId: string, expansionMode: 'cupidArrow' | 'voxPopuli' | null, savedAt: string) =>
      ({
        version: 1,
        profileId: 'profile-1',
        savedAt,
        game: {
          mode: 'classic',
          expansionMode,
          week: 3,
          status: 'active',
          runId,
          gameId: runId,
          players: [{ id: 'user', name: 'You', avatar: 'P', status: 'active', isUser: true }],
        },
        finale: {},
        social: {},
      }) as SavedSeasonSnapshot

    localStorage.setItem(
      savedRunsKeyForProfile('profile-1'),
      JSON.stringify({
        version: 2,
        profileId: 'profile-1',
        savedAt: '2026-08-01T00:00:00.000Z',
        activeRunId: null,
        lastPlayedRunId: null,
        stats: { maxSurvivorDaysSurvived: 0, survivorAchievementsUnlocked: {} },
      })
    )
    saveSeasonSnapshot(savedRunSlotKeyForProfile('profile-1', 'classic'), makeSnapshot('classic-old', null, '2026-08-01T10:00:00.000Z'))
    saveSeasonSnapshot(savedRunSlotKeyForProfile('profile-1', 'cupidArrow'), makeSnapshot('cupid-old', 'cupidArrow', '2026-08-02T10:00:00.000Z'))
    saveSeasonSnapshot(savedRunSlotKeyForProfile('profile-1', 'voxPopuli'), makeSnapshot('vox-old', 'voxPopuli', '2026-08-03T10:00:00.000Z'))

    expect(getFiniteSeasonRunChoices(loadSavedRunProfile('profile-1')).map((choice) => choice.slot)).toEqual([
      'voxPopuli',
      'cupidArrow',
      'classic',
    ])
    expect(activateFiniteSeasonRun('profile-1', 'cupidArrow')).toBe(true)

    const migrated = loadSavedRunProfile('profile-1')
    expect(migrated.activeSeasonSlot).toBe('cupidArrow')
    expect(migrated.retiredFiniteSlots).toEqual(['classic', 'voxPopuli'])
    expect(getFiniteSeasonRunChoices(migrated).map((choice) => choice.slot)).toEqual(['cupidArrow'])
    expect(localStorage.getItem(savedRunSlotKeyForProfile('profile-1', 'classic'))).not.toBeNull()
    expect(localStorage.getItem(savedRunSlotKeyForProfile('profile-1', 'voxPopuli'))).not.toBeNull()
  })

  it('removes active and recovery-only run data when a profile is deleted', () => {
    const snapshot = {
      version: 1,
      profileId: 'profile-1',
      savedAt: '2026-08-05T10:00:00.000Z',
      game: {
        mode: 'classic',
        week: 2,
        status: 'active',
        runId: 'classic-run',
        gameId: 'classic-run',
        players: [{ id: 'user', name: 'You', avatar: 'P', status: 'active', isUser: true }],
      },
      finale: {},
      social: {},
    } as SavedSeasonSnapshot
    saveRunSnapshot('profile-1', snapshot)
    clearSavedRunProfile('profile-1')
    expect(localStorage.getItem(savedRunsKeyForProfile('profile-1'))).toBeNull()
    expect(localStorage.getItem(savedRunSlotKeyForProfile('profile-1', 'classic'))).toBeNull()
  })

  it('rewrites only the canonical finite slot while preserving independent/recovery blobs', () => {
    const makeSnapshot = (
      runId: string,
      mode: 'classic' | 'survival',
      expansionMode: 'cupidArrow' | 'voxPopuli' | null,
      week = 2
    ) =>
      ({
        version: 1,
        profileId: 'profile-1',
        savedAt: `2026-08-11T20:00:${String(week).padStart(2, '0')}.000Z`,
        game: {
          mode,
          expansionMode,
          week,
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
    expect(saveRunSnapshot('profile-1', makeSnapshot('cupid-run', 'classic', 'cupidArrow'))).toBe(true)
    expect(saveRunSnapshot('profile-1', makeSnapshot('vox-run', 'classic', 'voxPopuli'))).toBe(true)

    const metadataKey = savedRunsKeyForProfile('profile-1')
    const classicKey = savedRunSlotKeyForProfile('profile-1', 'classic')
    const survivalKey = savedRunSlotKeyForProfile('profile-1', 'survival')
    const cupidKey = savedRunSlotKeyForProfile('profile-1', 'cupidArrow')
    const voxKey = savedRunSlotKeyForProfile('profile-1', 'voxPopuli')
    const before = {
      metadata: localStorage.getItem(metadataKey),
      classic: localStorage.getItem(classicKey),
      survival: localStorage.getItem(survivalKey),
      cupid: localStorage.getItem(cupidKey),
      vox: localStorage.getItem(voxKey),
    }

    expect(saveRunSnapshot('profile-1', makeSnapshot('classic-run', 'classic', null, 3))).toBe(true)

    expect(localStorage.getItem(metadataKey)).not.toBe(before.metadata)
    expect(localStorage.getItem(classicKey)).not.toBe(before.classic)
    expect(localStorage.getItem(survivalKey)).toBe(before.survival)
    expect(localStorage.getItem(cupidKey)).toBe(before.cupid)
    expect(localStorage.getItem(voxKey)).toBe(before.vox)

    const profile = loadSavedRunProfile('profile-1')
    expect(profile.activeSeasonSlot).toBe('classic')
    expect(profile.retiredFiniteSlots).toEqual(['cupidArrow', 'voxPopuli'])
    expect(profile.runs.classic?.game.week).toBe(3)
    expect(profile.runs.survival?.game.runId).toBe('survival-run')
    expect(profile.runs.cupidArrow).toBeUndefined()
    expect(profile.runs.voxPopuli).toBeUndefined()
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
