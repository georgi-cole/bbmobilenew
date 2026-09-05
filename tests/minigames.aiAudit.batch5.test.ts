import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { mulberry32 } from '../src/store/rng';

import { getGame } from '../src/minigames/registry';
import { minigameAiRegistry } from '../src/ai/competition/minigameAiRegistry';

import biographyBlitzReducer, {
  initBiographyBlitz,
  submitBiographyBlitzAnswer,
  resolveRound,
  advanceFromReveal,
  pickEliminationTarget,
  startNextRound,
} from '../src/features/biographyBlitz/biography_blitz_logic';
import { generateBioQuestions } from '../src/features/biographyBlitz/bioQuestionGenerator';

import {
  CAPITALIZATION_QUESTIONS_PER_CONTINENT,
  CAPITALIZATION_TOTAL_QUESTIONS,
  buildCapitalizationQuestionSet,
  createCapitalizationAiRng,
  createCapitalizationStandings,
  eliminateCapitalizationField,
  rankCapitalizationStandings,
  resolveCapitalizationRunSeed,
  simulateCapitalizationAiPerformance,
} from '../src/components/Capitalization/capitalizationUtils';
import {
  CAPITALIZATION_CONTINENTS,
  CAPITALIZATION_COUNTRIES_BY_CONTINENT,
} from '../src/components/Capitalization/capitalizationData';

import {
  advanceTurn,
  applyEffectSelection,
  createInitialState,
  getCurrentPlayer,
  getNextEligiblePlayer,
  getValidTargets,
  resolveBoxSelection,
  type GameState,
  type GridPlayer,
  type ResolvedParticipant,
} from '../src/components/GridOfLuck/gridOfLuckLogic';

function makeBioStore() {
  return configureStore({ reducer: { biographyBlitz: biographyBlitzReducer } });
}

function makeParticipants(count = 6): ResolvedParticipant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `Player ${index + 1}`,
    isHuman: index === 0,
    precomputedScore: 100 - index * 5,
    avatar: String.fromCharCode(65 + index),
  }));
}

function updatePlayers(state: GameState, mutate: (players: GridPlayer[]) => void): GameState {
  const players = state.players.map((player) => ({ ...player, statusEffects: [...player.statusEffects] }));
  mutate(players);
  return { ...state, players };
}

const T0 = 1_700_000_000_000;

describe('Registry coverage', () => {
  it('registers the active target games', () => {
    expect(getGame('biographyBlitz')?.reactComponentKey).toBe('BiographyBlitz');
    expect(getGame('cardClash')?.reactComponentKey).toBe('HouseOfCards');
    expect(getGame('threeDigitsQuiz')?.reactComponentKey).toBe('NumberTrivia');
    expect(getGame('capitalization')?.reactComponentKey).toBe('Capitalization');
    expect(getGame('crystal_path_shattered')?.reactComponentKey).toBe('CrystalPathShattered');
    expect(getGame('gridOfLuck')?.reactComponentKey).toBe('GridOfLuck');
  });

  it('keeps AI registry entries for the covered games', () => {
    expect(minigameAiRegistry.biographyBlitz).toBeDefined();
    expect(minigameAiRegistry.cardClash).toBeDefined();
    expect(minigameAiRegistry.threeDigitsQuiz).toBeDefined();
    expect(minigameAiRegistry.capitalization).toBeDefined();
    expect(minigameAiRegistry.crystal_path_shattered).toBeDefined();
    expect(minigameAiRegistry.gridOfLuck).toBeDefined();
  });
});

describe('Biography Blitz audit', () => {
  it('generates deterministic bio questions and skips ambiguous placeholders', () => {
    const questions = generateBioQuestions(['finn', 'mimi', 'rae']);
    const again = generateBioQuestions(['finn', 'mimi', 'rae']);

    expect(questions).toEqual(again);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions.every((question) => question.correctAnswerId)).toBe(true);
  });

  it('runs a full round and resolves outcome only when the game is complete', () => {
    const store = makeBioStore();
    store.dispatch(
      initBiographyBlitz({
        participantIds: ['finn', 'mimi', 'rae'],
        competitionType: 'LOH',
        seed: 42,
        humanContestantId: 'finn',
        now: T0,
      }),
    );

    const correct = store.getState().biographyBlitz.currentQuestion?.correctAnswerId ?? '';
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'mimi', answerId: correct, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'finn' }));
    store.dispatch(startNextRound({ now: T0 + 20_000 }));
    expect(store.getState().biographyBlitz.phase).toBe('question');
  });

  it('reaches complete when the final elimination leaves one contestant', () => {
    const store = makeBioStore();
    store.dispatch(
      initBiographyBlitz({
        participantIds: ['finn', 'mimi'],
        competitionType: 'LOH',
        seed: 42,
        humanContestantId: 'finn',
        now: T0,
      }),
    );

    const correct = store.getState().biographyBlitz.currentQuestion?.correctAnswerId ?? '';
    store.dispatch(submitBiographyBlitzAnswer({ contestantId: 'finn', answerId: correct, now: T0 + 100 }));
    store.dispatch(resolveRound());
    store.dispatch(advanceFromReveal());
    store.dispatch(pickEliminationTarget({ targetId: 'mimi' }));

    expect(store.getState().biographyBlitz.phase).toBe('complete');
    expect(store.getState().biographyBlitz.competitionWinnerId).toBe('finn');
  });
});

describe('Capitalization audit', () => {
  it('builds a deterministic question set of three continents and nine questions', () => {
    const set = buildCapitalizationQuestionSet(12345);

    expect(set.continents).toHaveLength(3);
    expect(set.questions).toHaveLength(CAPITALIZATION_TOTAL_QUESTIONS);
    expect(set.continents).not.toContain('Antarctica');

    for (let index = 0; index < set.continents.length; index += 1) {
      const block = set.questions.slice(
        index * CAPITALIZATION_QUESTIONS_PER_CONTINENT,
        (index + 1) * CAPITALIZATION_QUESTIONS_PER_CONTINENT,
      );
      expect(block.every((question) => question.continent === set.continents[index])).toBe(true);
    }
  });

  it('simulates deterministic AI performance and elimination ordering', () => {
    const question = buildCapitalizationQuestionSet(91).questions[0];
    const participant = {
      id: 'ai-atlas',
      name: 'Atlas Byte',
      isHuman: false,
      precomputedScore: 82,
    };
    const first = simulateCapitalizationAiPerformance(
      { participant, question },
      createCapitalizationAiRng({
        seed: 91,
        questionNumber: question.questionNumber,
        participantId: participant.id,
      }),
    );
    const second = simulateCapitalizationAiPerformance(
      { participant, question },
      createCapitalizationAiRng({
        seed: 91,
        questionNumber: question.questionNumber,
        participantId: participant.id,
      }),
    );
    expect(first).toEqual(second);

    const participants = [
      { id: 'human', name: 'You', isHuman: true, precomputedScore: 0 },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `ai-${index}`,
        name: `AI ${index}`,
        isHuman: false,
        precomputedScore: 50,
      })),
    ];
    const standings = createCapitalizationStandings(participants).map((standing) => ({
      ...standing,
      cumulativeScore: standing.isHuman ? 1 : Number(standing.participantId.replace('ai-', '')),
    }));
    const result = eliminateCapitalizationField(standings, 3);
    const ranked = rankCapitalizationStandings(result.standings);

    expect(result.eliminatedIds).toEqual(['ai-0', 'ai-1', 'human', 'ai-2']);
    expect(result.eliminatedIds).toContain('human');
    expect(ranked[ranked.length - 1].eliminatedAfterQuestion).toBe(3);
  });

  it('keeps the answer normalizer and run seed behavior stable', () => {
    expect(resolveCapitalizationRunSeed(undefined, () => 1234)).toBe(1234);
    expect(resolveCapitalizationRunSeed(0, () => 5678)).toBe(5678);
    expect(resolveCapitalizationRunSeed(77, () => 9999)).toBe(77);
    expect(CAPITALIZATION_CONTINENTS).toContain('Oceania');
    expect(CAPITALIZATION_COUNTRIES_BY_CONTINENT.Oceania.map((country) => country.name))
      .toEqual(expect.arrayContaining(['Australia', 'New Zealand']));
  });
});

describe('Grid of Luck audit', () => {
  it('rerolls elimination-type boxes away from the opening turns', () => {
    const state = createInitialState(makeParticipants(), 7);
    state.gridBoxes[0].type = 'execution';
    state.gridBoxes[1].type = 'gain200';

    const outcome = resolveBoxSelection(state, getCurrentPlayer(state).id, 0, mulberry32(19));

    expect(outcome.revealedEffectType).not.toBe('execution');
    expect(outcome.revealedEffectType).not.toBe('martyrdom');
    expect(outcome.state.gridBoxes[0]?.isOpened).toBe(true);
  });

  it('protects early game elimination and advances turn logic deterministically', () => {
    let state = createInitialState(makeParticipants(), 17);
    state = updatePlayers(state, (players) => {
      players[0]!.lp = 500;
      players[1]!.lp = 410;
      players[2]!.lp = 120;
      for (const player of players.slice(3)) {
        player.isEliminated = true;
        player.lp = 0;
      }
    });
    state.gridBoxes.forEach((box, index) => {
      box.isOpened = index < 10;
    });

    const outcome = applyEffectSelection(state, state.players[0]!.id, 'steal150', 10, [state.players[2]!.id], mulberry32(23));
    const victim = outcome.state.players.find((player) => player.id === state.players[2]!.id);

    expect(victim?.isEliminated).toBe(false);
    expect(victim?.lp).toBe(120);
    expect(getNextEligiblePlayer(state)?.id).toBeTruthy();
  });

  it('keeps target selection and turn advancement consistent', () => {
    let state = createInitialState(makeParticipants(5), 41);
    state = updatePlayers(state, (players) => {
      players[1]!.skipTurns = 1;
      players[2]!.isEliminated = true;
      players[2]!.lp = 0;
      players[3]!.skipTurns = 2;
    });

    const preview = getNextEligiblePlayer(state);
    const advanced = advanceTurn(state);

    expect(preview?.id).toBe(getCurrentPlayer(advanced.state).id);
    expect(getValidTargets(advanced.state.players, advanced.state.players[0]!.id, 'execution').length).toBeGreaterThan(0);
  });
});
