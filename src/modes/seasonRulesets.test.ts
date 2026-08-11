import { describe, expect, it } from 'vitest'
import {
  canOfferSurpriseMe,
  getActiveFiniteSeason,
  getEligibleSeasonRulesets,
  getPlayableLastRun,
  pickSurpriseRuleset,
} from './seasonRulesets'
import type { SavedRunProfile, SavedSeasonSnapshot } from '../store/saveStatePersistence'

function snapshot(
  profileId: string,
  slot: 'classic' | 'cupidArrow' | 'voxPopuli' | 'survival',
  savedAt: string,
  runId: string
): SavedSeasonSnapshot {
  return {
    version: 1,
    profileId,
    savedAt,
    game: {
      gameId: runId,
      runId,
      mode: slot === 'survival' ? 'survival' : 'classic',
      expansionMode:
        slot === 'cupidArrow' || slot === 'voxPopuli' ? slot : null,
    } as SavedSeasonSnapshot['game'],
    finale: {} as SavedSeasonSnapshot['finale'],
    social: {} as SavedSeasonSnapshot['social'],
  }
}

function profile(
  runs: SavedRunProfile['runs'],
  overrides: Partial<Pick<SavedRunProfile, 'activeRunId' | 'lastPlayedRunId'>> = {}
): SavedRunProfile {
  return {
    version: 2,
    profileId: 'p1',
    savedAt: '2026-08-11T00:00:00.000Z',
    activeRunId: overrides.activeRunId ?? null,
    lastPlayedRunId: overrides.lastPlayedRunId ?? null,
    runs,
    stats: { maxSurvivorDaysSurvived: 0, survivorAchievementsUnlocked: {} },
  }
}

describe('season rulesets', () => {
  it('always keeps Classic eligible and never grants unowned expansions', () => {
    expect(getEligibleSeasonRulesets({ cupidArrow: false, voxPopuli: false })).toEqual(['classic'])
    expect(getEligibleSeasonRulesets({ cupidArrow: true, voxPopuli: false })).toEqual([
      'classic',
      'cupidArrow',
    ])
  })

  it('offers Surprise Me only when at least two owned rulesets are eligible', () => {
    expect(canOfferSurpriseMe(['classic'])).toBe(false)
    expect(canOfferSurpriseMe(['classic', 'voxPopuli'])).toBe(true)
  })

  it('Surprise Me can only select from the supplied entitlement-safe pool', () => {
    const eligible = getEligibleSeasonRulesets({ cupidArrow: false, voxPopuli: true })
    expect(pickSurpriseRuleset(eligible, () => 0)).toBe('classic')
    expect(pickSurpriseRuleset(eligible, () => 0.999)).toBe('voxPopuli')
    expect(eligible).not.toContain('cupidArrow')
  })

  it('uses activeRunId to expose only one canonical finite legacy save', () => {
    const classic = snapshot('p1', 'classic', '2026-08-10T00:00:00.000Z', 'classic-run')
    const cupid = snapshot('p1', 'cupidArrow', '2026-08-11T00:00:00.000Z', 'cupid-run')
    const saved = profile(
      { classic, cupidArrow: cupid },
      { activeRunId: 'classic-run', lastPlayedRunId: 'cupid-run' }
    )

    expect(getActiveFiniteSeason(saved)?.ruleset).toBe('classic')
  })

  it('falls back to the newest finite legacy save without deleting the others', () => {
    const classic = snapshot('p1', 'classic', '2026-08-09T00:00:00.000Z', 'classic-run')
    const vox = snapshot('p1', 'voxPopuli', '2026-08-11T00:00:00.000Z', 'vox-run')
    const saved = profile({ classic, voxPopuli: vox })

    expect(getActiveFiniteSeason(saved)?.ruleset).toBe('voxPopuli')
    expect(saved.runs.classic).toBe(classic)
  })

  it('Continue Last considers only the canonical finite season and Surveyeval', () => {
    const classic = snapshot('p1', 'classic', '2026-08-11T00:00:00.000Z', 'classic-run')
    const hiddenCupid = snapshot('p1', 'cupidArrow', '2026-08-12T00:00:00.000Z', 'hidden-cupid')
    const survival = snapshot('p1', 'survival', '2026-08-10T00:00:00.000Z', 'survival-run')
    const saved = profile(
      { classic, cupidArrow: hiddenCupid, survival },
      { activeRunId: 'classic-run', lastPlayedRunId: 'hidden-cupid' }
    )

    expect(getPlayableLastRun(saved)?.game.runId).toBe('classic-run')
  })
})
