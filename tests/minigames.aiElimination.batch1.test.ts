import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../src/store/rng';
import {
  CHAIN_LADDER,
  buildAiVoteRecords,
  decideAiAction,
  rankPlayersByScore,
  resolveVoteElimination,
  type ChainOfGreedChainState,
  type ChainOfGreedPlayerState,
} from '../src/components/ChainOfGreed/chainOfGreedLogic';
import {
  aiShouldSpinAgain,
  aiShouldStop,
  computeEliminatedPlayers,
  computeEliminationCount,
  getRoundCap,
  type RiskWheelAiDecisionContext,
} from '../src/features/riskWheel/riskWheelSlice';
import {
  aiDecisionRng as blackjackDecisionRng,
  aiPickFighters,
  aiShouldHit,
  computeSpinnerWinnerIndex,
  resolveDuelOutcome,
} from '../src/features/blackjackTournament/blackjackTournamentSlice';
import {
  buildAiJuryVotes,
  buildAiVotes,
  getValidSaboteurCandidates,
  noJuryFallbackWinner,
  pickSaboteur,
  pickVictimForAi,
  pickVoteForAiOrAbstain,
  resolveFinal2,
  resolveRound,
} from '../src/features/silentSaboteur/helpers';

function makeChainPlayer(id: string, overrides: Partial<ChainOfGreedPlayerState> = {}): ChainOfGreedPlayerState {
  return {
    id,
    name: id,
    isHuman: id === 'human',
    avatar: '◉',
    precomputedScore: 50,
    isEliminated: false,
    totalContribution: 0,
    roundContribution: 0,
    roundCorrectGuesses: 0,
    roundWrongGuesses: 0,
    roundBanks: 0,
    roundBusts: 0,
    totalCorrectGuesses: 0,
    totalWrongGuesses: 0,
    totalBanks: 0,
    totalBusts: 0,
    voteCount: 0,
    semifinalScore: 0,
    finalScore: 0,
    turnsTakenThisRound: 0,
    personality: {
      aggression: 0.5,
      caution: 0.5,
      volatility: 0.5,
      social: 0.5,
    },
    lastRoundPerformance: 0,
    latestMoment: null,
    ...overrides,
  };
}

function makeChainState(overrides: Partial<ChainOfGreedChainState> = {}): ChainOfGreedChainState {
  return {
    step: 0,
    pot: 0,
    referenceNumber: 50,
    recentNumbers: [50],
    ...overrides,
  };
}

function makeRiskContext(overrides: Partial<RiskWheelAiDecisionContext> = {}): RiskWheelAiDecisionContext {
  return {
    seed: 42,
    round: 2,
    playerId: 'player-2',
    personality: 'balanced',
    currentScore: 150,
    activePlayerIds: ['player-1', 'player-2', 'player-3'],
    roundScores: {
      'player-1': 300,
      'player-2': 150,
      'player-3': 60,
    },
    spinsRemaining: 2,
    initialPlayerCount: 6,
    decisionIndex: 0,
    ...overrides,
  };
}

describe('Batch 1 AI and elimination audit', () => {
  describe('Chain of Greed', () => {
    it('keeps bank, higher, and lower branches reachable and votes valid', () => {
      const human = makeChainPlayer('human', {
        isHuman: true,
        name: 'You',
        precomputedScore: 82,
        roundContribution: 180,
        personality: {
          aggression: 0.28,
          caution: 0.88,
          volatility: 0.2,
          social: 0.6,
        },
      });
      const banker = makeChainPlayer('banker', {
        precomputedScore: 96,
        roundContribution: 260,
        personality: {
          aggression: 0.18,
          caution: 0.96,
          volatility: 0.12,
          social: 0.3,
        },
      });
      const highRisk = makeChainPlayer('high-risk', {
        precomputedScore: 98,
        roundContribution: 42,
        personality: {
          aggression: 0.92,
          caution: 0.08,
          volatility: 0.75,
          social: 0.4,
        },
      });
      const lowRisk = makeChainPlayer('low-risk', {
        precomputedScore: 35,
        roundContribution: 20,
        personality: {
          aggression: 0.1,
          caution: 0.9,
          volatility: 0.12,
          social: 0.65,
        },
      });

      expect(
        decideAiAction({
          player: banker,
          chain: makeChainState({
            step: 6,
            pot: CHAIN_LADDER[5],
            referenceNumber: 62,
            recentNumbers: [18, 39, 62],
          }),
          remainingTurns: 4,
          phase: 'standard',
          activePlayers: [human, banker, highRisk],
          bankAvailable: true,
        }),
      ).toBe('bank');

      expect(
        decideAiAction({
          player: highRisk,
          chain: makeChainState({
            step: 1,
            pot: CHAIN_LADDER[0],
            referenceNumber: 24,
            recentNumbers: [31, 24],
          }),
          remainingTurns: 3,
          phase: 'standard',
          activePlayers: [highRisk, lowRisk],
          bankAvailable: false,
        }),
      ).toBe('higher');

      expect(
        decideAiAction({
          player: lowRisk,
          chain: makeChainState({
            step: 0,
            pot: CHAIN_LADDER[0],
            referenceNumber: 82,
            recentNumbers: [77, 82],
          }),
          remainingTurns: 4,
          phase: 'standard',
          activePlayers: [lowRisk, highRisk],
          bankAvailable: false,
        }),
      ).toBe('lower');

      const votes = buildAiVoteRecords({
        activePlayers: [human, banker, highRisk, lowRisk],
        roundNumber: 2,
        seed: 77,
        humanVoteTargetId: highRisk.id,
      });

      expect(votes).toHaveLength(4);
      expect(votes.find((vote) => vote.voterId === human.id)?.targetId).toBe(highRisk.id);
      expect(votes.every((vote) => vote.targetId !== vote.voterId)).toBe(true);
      expect(votes.filter((vote) => vote.voterId !== human.id).every((vote) => vote.targetId !== human.id)).toBe(true);
    });

    it('keeps sudden-death tie-break winners out of the eliminated set', () => {
      const tieA = makeChainPlayer('tie-a', {
        roundContribution: 40,
        totalContribution: 160,
        roundCorrectGuesses: 2,
      });
      const tieB = makeChainPlayer('tie-b', {
        roundContribution: 40,
        totalContribution: 160,
        roundCorrectGuesses: 2,
      });
      const observer = makeChainPlayer('observer', {
        roundContribution: 10,
        totalContribution: 50,
        roundCorrectGuesses: 1,
      });
      const players = [tieA, tieB, observer];
      const scores = {
        'tie-a': 50,
        'tie-b': 50,
        observer: 10,
      };

      const ranking = rankPlayersByScore(scores, players, mulberry32(11));
      expect(ranking.tieBreak?.type).toBe('duel');
      const winnerId = ranking.ordered[0]?.id;
      const loserId = ranking.ordered[1]?.id;
      expect(winnerId).toBeTruthy();
      expect(loserId).toBeTruthy();
      if (!winnerId || !loserId) return;

      const elimination = resolveVoteElimination({
        activePlayers: players,
        votes: [
          {
            voterId: tieA.id,
            voterName: tieA.name,
            targetId: tieB.id,
            targetName: tieB.name,
            reason: 'tight race',
          },
          {
            voterId: tieB.id,
            voterName: tieB.name,
            targetId: tieA.id,
            targetName: tieA.name,
            reason: 'tight race',
          },
        ],
        eliminateCount: 1,
        rng: mulberry32(11),
      });

      expect(elimination.tieBreaks[0]?.type).toBe('duel');
      expect(elimination.eliminatedIds).toHaveLength(1);
      expect(elimination.eliminatedIds[0]).toBe(loserId);
      expect(elimination.eliminatedIds[0]).not.toBe(winnerId);
    });
  });

  describe('Risk Wheel', () => {
    it('keeps AI stop/continue decisions and tie-break eliminations from collapsing', () => {
      const outcomes = new Set<boolean>();
      for (let seed = 0; seed < 24; seed++) {
        outcomes.add(
          aiShouldSpinAgain(
            makeRiskContext({
              seed,
              round: 2,
              playerId: 'player-2',
              personality: seed % 3 === 0 ? 'cautious' : seed % 3 === 1 ? 'balanced' : 'risky',
              currentScore: 120 + (seed % 5) * 60,
              activePlayerIds: ['player-1', 'player-2', 'player-3'],
              roundScores: {
                'player-1': 320,
                'player-2': 180,
                'player-3': 60,
              },
              spinsRemaining: seed % 2 === 0 ? 2 : 1,
              initialPlayerCount: 6,
              decisionIndex: seed,
            }),
          ),
        );
      }

      outcomes.add(
        aiShouldSpinAgain(
          makeRiskContext({
            currentScore: 0,
            spinsRemaining: 2,
            personality: 'cautious',
          }),
        ),
      );
      outcomes.add(
        aiShouldStop(
          makeRiskContext({
            currentScore: 900,
            spinsRemaining: 1,
            personality: 'cautious',
            roundScores: {
              'player-1': 300,
              'player-2': 900,
              'player-3': 60,
            },
          }),
        ),
      );

      expect(outcomes.has(true)).toBe(true);
      expect(outcomes.has(false)).toBe(true);
      expect(aiShouldSpinAgain(makeRiskContext({ currentScore: 0, spinsRemaining: 2 }))).toBe(true);
      expect(aiShouldStop(makeRiskContext({ currentScore: 900, spinsRemaining: 1, personality: 'cautious' }))).toBe(true);

      const eliminated = new Set<string>();
      const activeIds = ['a', 'b', 'c', 'd'];
      const scores = {
        a: 10,
        b: 10,
        c: 40,
        d: 80,
      };
      for (let seed = 0; seed < 200; seed++) {
        const picks = computeEliminatedPlayers(activeIds, scores, 1, seed);
        eliminated.add(picks[0]!);
      }

      expect(eliminated).toEqual(new Set(['a', 'b']));
      expect(getRoundCap(4)).toBe(3);
      expect(computeEliminationCount(5, 1, 5)).toBe(2);
      expect(computeEliminationCount(5, 3, 3)).toBe(1);
    });
  });

  describe('Blackjack Tournament', () => {
    it('keeps hit/stand, spinner, and fighter selection branches varied', () => {
      const hitOutcomes = new Set<boolean>();
      for (let seed = 0; seed < 40; seed++) {
        const total = 13 + (seed % 4);
        const rngValue = blackjackDecisionRng(seed, seed % 5, `fighter-${seed % 3}`, seed);
        hitOutcomes.add(aiShouldHit(total, rngValue));
      }

      expect(hitOutcomes.has(true)).toBe(true);
      expect(hitOutcomes.has(false)).toBe(true);
      expect(aiShouldHit(12, 0.99)).toBe(true);
      expect(aiShouldHit(17, 0.01)).toBe(false);
      expect(resolveDuelOutcome([10, 9], [10, 8])).toBe('fighterA');
      expect(resolveDuelOutcome([10, 8], [10, 9])).toBe('fighterB');
      expect(resolveDuelOutcome([10, 9], [10, 9])).toBe('tie');

      const pairings = new Set<string>();
      for (let seed = 0; seed < 20; seed++) {
        const pair = aiPickFighters(seed, 1, 'controller', ['controller', 'a', 'b', 'c']);
        expect(pair).not.toBeNull();
        if (!pair) return;
        expect(pair.fighterAId).not.toBe('controller');
        expect(pair.fighterBId).not.toBe('controller');
        expect(pair.fighterAId).not.toBe(pair.fighterBId);
        pairings.add([pair.fighterAId, pair.fighterBId].sort().join('-'));
      }

      expect(pairings.size).toBeGreaterThan(1);
      expect(computeSpinnerWinnerIndex(123, 4)).toBeGreaterThanOrEqual(0);
      expect(computeSpinnerWinnerIndex(123, 4)).toBeLessThan(4);
    });
  });

  describe('Silent Saboteur', () => {
    it('keeps votes legal, exercises abstain handling, and resolves both jury outcomes', () => {
      const activeIds = ['alice', 'bob', 'carol', 'dave'];
      expect(getValidSaboteurCandidates(activeIds, 'alice', 'bob')).toEqual(['carol', 'dave']);
      expect(pickVoteForAiOrAbstain(7, 0, 'alice', ['alice', 'bob'], 'bob')).toBeNull();

      const saboteurs = new Set<string>();
      const victims = new Set<string>();
      const accused = new Set<string>();
      for (let seed = 0; seed < 40; seed++) {
        const round = seed % 5;
        const saboteur = pickSaboteur(seed, round, activeIds);
        const victim = pickVictimForAi(seed, round, saboteur, activeIds);
        saboteurs.add(saboteur);
        victims.add(victim);
        expect(victim).not.toBe(saboteur);

        const aiVotes = buildAiVotes(seed, round, ['alice', 'carol', 'dave'], activeIds, victim);
        expect(Object.keys(aiVotes)).toHaveLength(3);
        for (const [voterId, targetId] of Object.entries(aiVotes)) {
          expect(targetId).not.toBe(voterId);
          expect(targetId).not.toBe(victim);
        }

        const vote = pickVoteForAiOrAbstain(seed, round, 'alice', activeIds, victim);
        if (vote) accused.add(vote);
      }

      expect(saboteurs.size).toBeGreaterThan(1);
      expect(victims.size).toBeGreaterThan(1);
      expect(accused.size).toBeGreaterThan(1);

      expect(
        resolveRound(
          {
            alice: 'carol',
            bob: 'carol',
            carol: 'dave',
            dave: 'carol',
          },
          'dave',
          'alice',
          activeIds,
        ),
      ).toEqual({
        eliminatedId: 'alice',
        reason: 'victim_eliminated',
        victimOverride: false,
        accusedId: 'carol',
      });

      const juryTargets = new Set<string>();
      let saboteurVotes = 0;
      let victimVotes = 0;
      for (let seed = 0; seed < 20; seed++) {
        const juryVotes = buildAiJuryVotes(seed, ['j1', 'j2', 'j3', 'j4'], 's', 'v');
        for (const vote of Object.values(juryVotes)) {
          juryTargets.add(vote);
          if (vote === 's') saboteurVotes += 1;
          if (vote === 'v') victimVotes += 1;
        }
      }

      expect(juryTargets).toEqual(new Set(['s', 'v']));
      expect(saboteurVotes).toBeGreaterThan(0);
      expect(victimVotes).toBeGreaterThan(0);
      expect(resolveFinal2({ j1: 's', j2: 's', j3: 'v' }, 's', 'v')).toEqual({
        winnerId: 'v',
        eliminatedId: 's',
        reason: 'jury_correct',
      });
      expect(resolveFinal2({ j1: 'v', j2: 'v', j3: 's' }, 's', 'v')).toEqual({
        winnerId: 's',
        eliminatedId: 'v',
        reason: 'jury_incorrect',
      });
      expect(resolveFinal2({ j1: 's', j2: 'v' }, 's', 'v')).toEqual({
        winnerId: 's',
        eliminatedId: 'v',
        reason: 'jury_tie',
      });
      expect(['s', 'v']).toContain(noJuryFallbackWinner(99, 's', 'v'));
      expect(noJuryFallbackWinner(99, 's', 'v')).toBe(noJuryFallbackWinner(99, 's', 'v'));
    });
  });
});
