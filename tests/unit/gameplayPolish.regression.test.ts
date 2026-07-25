import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import finaleReducer, {
  finalizeFinale,
  PUBLIC_JUROR_ID,
  startFinale,
} from '../../src/store/finaleSlice'
import { resolvePublicVoteParity, tallyVotes } from '../../src/utils/juryUtils'
import {
  getOutcomeVisibleEvicteeIds,
  hasUnresolvedTopVoteTie,
} from '../../src/screens/GameScreen/evictionTieVisuals'
import { splitFinalePlayers } from '../../src/components/FinalFaceoff/finaleEligibility'
import { resolveExtraordinaryRemovalPlayerId } from '../../src/store/tribunalEligibilityMiddleware'
import { resolvePublicMeterDestination } from '../../src/components/FloatingActionBar/publicMeterNavigation'
import type { Player } from '../../src/types'
import type { PlayerPublicProfile } from '../../src/publicOpinion/types'

function profile(playerId: string, approval: number): PlayerPublicProfile {
  return {
    playerId,
    approval,
    previousApproval: approval,
    seasonApprovals: [approval],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
  }
}

function sourceText(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

describe('gameplay polish regressions', () => {
  it('centers Minesweeps and centers wrapped Silent Saboteur game-over labels', () => {
    const minesweepsCss = sourceText('src/components/Minesweeps/Minesweeps.css')
    const saboteurCss = sourceText('src/components/SilentSaboteurComp/SilentSaboteurComp.css')

    expect(minesweepsCss).toContain('place-items: center')
    expect(minesweepsCss).toContain('env(safe-area-inset-top)')
    expect(saboteurCss).toContain('Issue #1232')
    expect(saboteurCss).toContain('text-align: center')
    expect(saboteurCss).toContain('white-space: normal')
  })

  it('routes a disabled Public Mode button directly to the Store', () => {
    expect(resolvePublicMeterDestination(false, 0)).toBe('/store')
    expect(resolvePublicMeterDestination(true, 0)).toBe('/public-meter')
    expect(resolvePublicMeterDestination(true, 2)).toBe('/public-meter?tab=requests')
  })

  it('renders Ali-enters with an outgoing eviction treatment', () => {
    const css = sourceText('src/components/TwinShockRevealOverlay/TwinShockRevealOverlay.css')

    expect(css).toContain('Issue #1241')
    expect(css).toContain('twin-shock-reveal--ali_enters')
    expect(css).toContain('grayscale(1)')
    expect(css).toContain('linear-gradient')
  })

  it('keeps a tied eviction visually neutral even when a reducer preselected Nico', () => {
    const votes = { ash: 4, nico: 4 }

    expect(hasUnresolvedTopVoteTie(votes)).toBe(true)
    expect(
      getOutcomeVisibleEvicteeIds({
        voteResults: votes,
        pendingEvictionId: 'nico',
      })
    ).toEqual([])
  })

  it('uses only a roster-tile reverse eviction after Back 2 the Game', () => {
    const gameScreen = sourceText('src/screens/GameScreen/GameScreen.tsx')
    const rosterCss = sourceText('src/components/HouseguestGrid/HouseguestGrid.module.css')

    expect(gameScreen).toContain('returningPlayerId={battleBackReturnId}')
    expect(gameScreen).not.toContain('variant="return"')
    expect(rosterCss).toContain('battleBackReturnPortrait')
    expect(rosterCss).toContain('battleBackReturnStrike')
  })

  it('prefers eight regular members plus one public vote', () => {
    const result = resolvePublicVoteParity(
      ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'],
      ['pre1'],
      true
    )

    expect(result.jurorIds).toHaveLength(8)
    expect(result.jurorIds).toContain('pre1')
    expect(result.publicVoteWeight).toBe(1)
    expect(result.jurorIds.length + result.publicVoteWeight).toBe(9)
  })

  it('weights the public vote ×2 when no eligible promotion exists', () => {
    const result = resolvePublicVoteParity(['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'], [], true)

    expect(result.jurorIds).toHaveLength(7)
    expect(result.publicVoteWeight).toBe(2)
    expect(result.jurorIds.length + result.publicVoteWeight).toBe(9)
    expect(tallyVotes({ j1: 'a', [PUBLIC_JUROR_ID]: 'b' }, { [PUBLIC_JUROR_ID]: 2 })).toEqual({
      a: 1,
      b: 2,
    })
  })

  it('excludes extraordinary removals from Tribunal and pre-Tribunal promotion pools', () => {
    const players: Player[] = [
      { id: 'finalist-a', name: 'A', avatar: 'A', status: 'active' },
      { id: 'finalist-b', name: 'B', avatar: 'B', status: 'active' },
      { id: 'normal-juror', name: 'J', avatar: 'J', status: 'jury' },
      {
        id: 'shock-removal',
        name: 'Shock',
        avatar: 'S',
        status: 'jury',
        tribunalEligible: false,
      },
      { id: 'normal-pre', name: 'P', avatar: 'P', status: 'evicted' },
      {
        id: 'self-evicted',
        name: 'Self',
        avatar: 'X',
        status: 'evicted',
        tribunalEligible: false,
      },
    ]

    const split = splitFinalePlayers(players)
    expect(split.jurors.map((player) => player.id)).toEqual(['normal-juror'])
    expect(split.preJury.map((player) => player.id)).toEqual(['normal-pre'])
  })

  it('persists ineligibility for self-eviction and shock replacement actions', () => {
    const human = {
      id: 'human',
      name: 'Human',
      avatar: 'H',
      status: 'active',
      isUser: true,
    } as Player
    const other = { id: 'other', name: 'Other', avatar: 'O', status: 'active' } as Player

    expect(
      resolveExtraordinaryRemovalPlayerId(
        { type: 'game/selfEvict' },
        { game: { players: [human, other] } }
      )
    ).toBe('human')
    expect(
      resolveExtraordinaryRemovalPlayerId(
        { type: 'game/confirmDayStartShock' },
        { game: { players: [human, other], dayStartShock: { targetId: 'other' } } }
      )
    ).toBe('other')
    expect(
      resolveExtraordinaryRemovalPlayerId(
        { type: 'game/completeTwinShockRevealAnimation' },
        {
          game: {
            players: [human, other],
            twinShock: {
              pendingRevealAnimation: {
                type: 'ali_enters',
                replacedPlayerId: 'other',
              },
            },
          },
        }
      )
    ).toBe('other')
  })

  it('persists public ×2 and resolves the displayed weighted tally without a hidden tie-break', () => {
    let state = finaleReducer(undefined, { type: '@@init' })
    state = finaleReducer(
      state,
      startFinale({
        finalistIds: ['a', 'b'],
        jurorIds: ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7'],
        preJuryIds: [],
        humanPlayerIds: [],
        seed: 42,
        publicApprovalProfiles: {
          a: profile('a', 95),
          b: profile('b', 10),
        },
      })
    )

    expect(state.publicJurorEnabled).toBe(true)
    expect(state.publicVoteWeight).toBe(2)
    expect(state.revealOrder.at(-1)).toBe(PUBLIC_JUROR_ID)

    state = {
      ...state,
      votes: {
        j1: 'a',
        j2: 'a',
        j3: 'a',
        j4: 'a',
        j5: 'b',
        j6: 'b',
        j7: 'b',
        [PUBLIC_JUROR_ID]: 'b',
      },
    }
    state = finaleReducer(state, finalizeFinale({ seed: 42 }))

    expect(state.winnerId).toBe('b')
    expect(state.isComplete).toBe(true)
  })
})
