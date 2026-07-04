import { describe, expect, it } from 'vitest';
import { selectSurvivorStandout } from '../src/modes/survivorStandout';
import type { ChallengeRun } from '../src/store/challengeSlice';
import type { GameState, Player } from '../src/types';

function player(
  id: string,
  options: Partial<Player> & { survivorEntryDay?: number } = {},
): Player {
  return {
    id,
    name: id.toUpperCase(),
    avatar: 'avatar.png',
    status: 'active',
    stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
    survivorEntryDay: 1,
    ...options,
  } as Player;
}

function survivorGame(players: Player[], currentDay = 10): GameState {
  return {
    mode: 'survival',
    modeSpecific: {
      kind: 'survival',
      currentDay,
      totalRoboContestantsEvicted: 0,
      bestDayReached: currentDay,
      startingCastSize: 8,
      nextRoboIndex: 8,
      competitionRotation: { usedKeys: [], round: 1 },
    },
    week: currentDay,
    players,
  } as unknown as GameState;
}

function run(scores: Record<string, number>, participants = Object.keys(scores)): ChallengeRun {
  return {
    id: 'run',
    gameKey: 'quickTap',
    seed: 1,
    participants,
    rawScores: scores,
    canonicalScores: scores,
    winnerId: participants[0] ?? '',
    timestamp: 1,
    authoritative: false,
  };
}

describe('selectSurvivorStandout', () => {
  it('selects the only player with the most days survived', () => {
    const result = selectSurvivorStandout(survivorGame([
      player('a', { survivorEntryDay: 1 }),
      player('b', { survivorEntryDay: 3 }),
    ], 7));

    expect(result?.status).toBe('leader');
    expect(result?.leader?.player.id).toBe('a');
    expect(result?.leader?.daysInGame).toBe(7);
    expect(result?.tieBreaker).toBe('days');
  });

  it('uses lower average competition placement to break a days tie when history is available', () => {
    const result = selectSurvivorStandout(
      survivorGame([player('a'), player('b')], 4),
      [run({ a: 80, b: 100 })],
    );

    expect(result?.status).toBe('leader');
    expect(result?.leader?.player.id).toBe('b');
    expect(result?.leader?.averagePlacement).toBe(1);
    expect(result?.tieBreaker).toBe('averagePlacement');
  });

  it('returns a tied state when days and average placement remain tied', () => {
    const result = selectSurvivorStandout(
      survivorGame([player('a'), player('b')], 4),
      [
        run({ a: 100, b: 80 }),
        run({ a: 80, b: 100 }),
      ],
    );

    expect(result?.status).toBe('tied');
    expect(result?.tiedPlayers.map((row) => row.player.id)).toEqual(['a', 'b']);
    expect(result?.tieBreaker).toBe('averagePlacement');
  });

  it('does not fabricate average rankings when no reliable placement history exists', () => {
    const result = selectSurvivorStandout(survivorGame([player('a'), player('b')], 4));

    expect(result?.status).toBe('tied');
    expect(result?.tiedPlayers.map((row) => row.averagePlacement)).toEqual([null, null]);
    expect(result?.tieBreaker).toBe('days');
  });

  it('excludes eliminated players from the standout ranking', () => {
    const result = selectSurvivorStandout(survivorGame([
      player('a', { survivorEntryDay: 1, status: 'evicted' }),
      player('b', { survivorEntryDay: 4 }),
    ], 8));

    expect(result?.status).toBe('leader');
    expect(result?.leader?.player.id).toBe('b');
  });

  it('returns null outside Survivor mode', () => {
    const result = selectSurvivorStandout({ mode: 'classic', players: [player('a')] } as unknown as GameState);

    expect(result).toBeNull();
  });
});
