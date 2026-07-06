import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  buildBaseAiAnswers,
  buildPeekPreview,
  buildPollEstimate,
  countAnswerDistribution,
  initializeDiceDuel,
  initializeThreeWayDice,
  pickAiDuelNumber,
  pickMajorityRulesQuestion,
  resolveDiceDuelRoll,
  resolveThreeWayDiceRoll,
  resolveMajorityRulesBallot,
  simulateMajorityRulesBallot,
  type MajorityRulesBallotResolution,
  type MajorityRulesDiceDuelState,
  type MajorityRulesHintInventory,
  type MajorityRulesHintPreview,
  type MajorityRulesHintType,
  type MajorityRulesQuestion,
  type MajorityRulesThreeWayDiceState,
} from './helpers';

export type MajorityRulesCompetitionType = 'LOH' | 'POS';

export type MajorityRulesPhase =
  | 'idle'
  | 'intro'
  | 'question'
  | 'reveal'
  | 'three_way_duel_pick'
  | 'three_way_duel_roll'
  | 'final_duel_pick'
  | 'final_duel_roll'
  | 'winner'
  | 'complete';

export interface MajorityRulesRevealState {
  result: MajorityRulesBallotResolution;
  revoteNumber: number;
}

export interface MajorityRulesState {
  phase: MajorityRulesPhase;
  competitionType: MajorityRulesCompetitionType;
  seed: number;
  participantIds: string[];
  activeIds: string[];
  eliminatedIds: string[];
  humanPlayerId: string | null;
  roundNumber: number;
  revoteNumber: number;
  currentQuestion: MajorityRulesQuestion | null;
  usedQuestionIds: string[];
  draftAnswers: Record<string, string>;
  previousDistribution: Record<string, number> | null;
  blockedAnswers: Record<string, string>;
  doubleEliminationArmed: boolean;
  hintInventories: Record<string, MajorityRulesHintInventory>;
  roundHintUsedBy: string | null;
  roundHintType: MajorityRulesHintType | null;
  roundHintTargetId: string | null;
  roundHintPollEstimate: Record<string, number> | null;
  roundHintPeekedAnswers: Record<string, string> | null;
  revealState: MajorityRulesRevealState | null;
  threeWayDuel: MajorityRulesThreeWayDiceState | null;
  finalDuel: MajorityRulesDiceDuelState | null;
  winnerId: string | null;
  outcomeResolved: boolean;
}

const initialState: MajorityRulesState = {
  phase: 'idle',
  competitionType: 'LOH',
  seed: 0,
  participantIds: [],
  activeIds: [],
  eliminatedIds: [],
  humanPlayerId: null,
  roundNumber: 1,
  revoteNumber: 0,
  currentQuestion: null,
  usedQuestionIds: [],
  draftAnswers: {},
  previousDistribution: null,
  blockedAnswers: {},
  doubleEliminationArmed: false,
  hintInventories: {},
  roundHintUsedBy: null,
  roundHintType: null,
  roundHintTargetId: null,
  roundHintPollEstimate: null,
  roundHintPeekedAnswers: null,
  revealState: null,
  threeWayDuel: null,
  finalDuel: null,
  winnerId: null,
  outcomeResolved: false,
};

function buildHintInventories(participantIds: string[]) {
  return Object.fromEntries(
    participantIds.map((id) => [
      id,
        {
          pollHintUsed: false,
          peekTwoUsed: false,
          followPlayerUsed: false,
        } satisfies MajorityRulesHintInventory,
    ]),
  );
}

function clearRoundHintState(state: MajorityRulesState) {
  state.roundHintUsedBy = null;
  state.roundHintType = null;
  state.roundHintTargetId = null;
  state.roundHintPollEstimate = null;
  state.roundHintPeekedAnswers = null;
}

function distributionsMatch(
  left: Record<string, number> | null,
  right: Record<string, number>,
): boolean {
  if (!left) return false;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] ?? 0) !== (right[key] ?? 0)) return false;
  }
  return true;
}

function prepareQuestion(state: MajorityRulesState) {
  const question = pickMajorityRulesQuestion(state.seed, state.roundNumber, state.usedQuestionIds);
  state.currentQuestion = question;
  if (!state.usedQuestionIds.includes(question.id)) {
    state.usedQuestionIds.push(question.id);
  }
  state.draftAnswers = {};
  state.revealState = null;
  clearRoundHintState(state);
}

function humanNeedsManualAnswer(state: MajorityRulesState) {
  return (
    state.humanPlayerId != null &&
    state.activeIds.includes(state.humanPlayerId) &&
    !(state.roundHintUsedBy === state.humanPlayerId && state.roundHintType === 'followPlayer')
  );
}

function getHumanHintPreview(state: MajorityRulesState): MajorityRulesHintPreview | null {
  if (state.roundHintUsedBy !== state.humanPlayerId || !state.roundHintType) return null;
  return {
    type: state.roundHintType,
    targetId: state.roundHintTargetId,
    pollEstimate: state.roundHintPollEstimate ?? undefined,
    peekedAnswers: state.roundHintPeekedAnswers ?? undefined,
  };
}

function getFinalists(state: MajorityRulesState): [string, string] | null {
  if (state.activeIds.length !== 2) return null;
  return [state.activeIds[0], state.activeIds[1]];
}

function ensureAiFinalDuelPicks(state: MajorityRulesState) {
  if (!state.finalDuel) return;
  for (const finalistId of state.finalDuel.finalists) {
    if (finalistId === state.humanPlayerId) continue;
    if (state.finalDuel.chosenNumbers[finalistId] != null) continue;
    const takenNumbers = Object.values(state.finalDuel.chosenNumbers).filter(
      (value): value is number => value != null,
    );
    state.finalDuel.chosenNumbers[finalistId] = pickAiDuelNumber(state.seed, finalistId, takenNumbers);
  }
  const allPicked = state.finalDuel.finalists.every(
    (finalistId) => state.finalDuel?.chosenNumbers[finalistId] != null,
  );
  if (allPicked && state.phase === 'final_duel_pick') {
    state.phase = 'final_duel_roll';
  }
}

function advanceToFinalDuel(state: MajorityRulesState) {
  const finalists = getFinalists(state);
  if (!finalists) return;
  state.threeWayDuel = null;
  state.finalDuel = initializeDiceDuel(finalists);
  state.phase = 'final_duel_pick';
  ensureAiFinalDuelPicks(state);
}

function ensureAiThreeWayDuelPicks(state: MajorityRulesState) {
  if (!state.threeWayDuel) return;
  for (const finalistId of state.threeWayDuel.finalists) {
    if (finalistId === state.humanPlayerId) continue;
    if (state.threeWayDuel.chosenNumbers[finalistId] != null) continue;
    const takenNumbers = Object.values(state.threeWayDuel.chosenNumbers).filter(
      (value): value is number => value != null,
    );
    state.threeWayDuel.chosenNumbers[finalistId] = pickAiDuelNumber(state.seed, finalistId, takenNumbers);
  }
  const allPicked = state.threeWayDuel.finalists.every(
    (finalistId) => state.threeWayDuel?.chosenNumbers[finalistId] != null,
  );
  if (allPicked && state.phase === 'three_way_duel_pick') {
    state.phase = 'three_way_duel_roll';
  }
}

function advanceToThreeWayDuel(state: MajorityRulesState) {
  if (state.activeIds.length !== 3) return;
  state.currentQuestion = null;
  state.draftAnswers = {};
  state.revealState = null;
  state.blockedAnswers = {};
  state.revoteNumber = 0;
  clearRoundHintState(state);
  state.finalDuel = null;
  state.threeWayDuel = initializeThreeWayDice([
    state.activeIds[0],
    state.activeIds[1],
    state.activeIds[2],
  ]);
  state.phase = 'three_way_duel_pick';
  ensureAiThreeWayDuelPicks(state);
}

function seedOpeningFinalDuel(state: MajorityRulesState) {
  const finalists = getFinalists(state);
  if (!finalists) return;
  state.finalDuel = initializeDiceDuel(finalists);
}

function prepareOpeningPhase(state: MajorityRulesState) {
  if (state.activeIds.length === 2) {
    state.currentQuestion = null;
    state.draftAnswers = {};
    state.revealState = null;
    clearRoundHintState(state);
    seedOpeningFinalDuel(state);
    return;
  }

  prepareQuestion(state);
}

const majorityRulesSlice = createSlice({
  name: 'majorityRules',
  initialState,
  reducers: {
    initMajorityRules(
      _state,
      action: PayloadAction<{
        participantIds: string[];
        competitionType: MajorityRulesCompetitionType;
        seed: number;
        humanPlayerId: string | null;
      }>,
    ): MajorityRulesState {
      const { participantIds, competitionType, seed, humanPlayerId } = action.payload;
      const state = {
        ...initialState,
        phase: 'intro' as const,
        competitionType,
        seed,
        participantIds: [...participantIds],
        activeIds: [...participantIds],
        eliminatedIds: [],
        humanPlayerId,
        usedQuestionIds: [],
        draftAnswers: {},
        blockedAnswers: {},
        previousDistribution: null,
        hintInventories: buildHintInventories(participantIds),
        revealState: null,
        threeWayDuel: null,
        finalDuel: null,
        winnerId: null,
        outcomeResolved: false,
      };
      prepareOpeningPhase(state);
      return state;
    },

    advanceIntro(state) {
      if (state.phase !== 'intro') return;
      if (state.activeIds.length === 2) {
        if (!state.finalDuel) {
          seedOpeningFinalDuel(state);
        }
        state.phase = 'final_duel_pick';
        ensureAiFinalDuelPicks(state);
        return;
      }
      state.phase = 'question';
    },

    setHumanAnswer(state, action: PayloadAction<{ playerId: string; optionId: string }>) {
      if (state.phase !== 'question' || !state.currentQuestion) return;
      const { playerId, optionId } = action.payload;
      if (playerId !== state.humanPlayerId || !state.activeIds.includes(playerId)) return;
      if (state.roundHintUsedBy === playerId && state.roundHintType === 'followPlayer') return;
      const blockedAnswer = state.blockedAnswers[playerId];
      if (blockedAnswer && blockedAnswer === optionId) return;
      if (!state.currentQuestion.options.some((option) => option.id === optionId)) return;
      state.draftAnswers[playerId] = optionId;
    },

    useHint(
      state,
      action: PayloadAction<{
        playerId: string;
        hintType: MajorityRulesHintType;
        targetId?: string | null;
      }>,
    ) {
      if (state.phase !== 'question' || !state.currentQuestion) return;
      const { playerId, hintType, targetId = null } = action.payload;
      if (!state.activeIds.includes(playerId)) return;
      if (state.roundHintUsedBy && state.roundHintUsedBy !== playerId) return;
      if (state.roundHintUsedBy === playerId && state.roundHintType && state.roundHintType !== hintType) {
        return;
      }

      const inventory = state.hintInventories[playerId];
      if (!inventory) return;
      const sameHintAsCurrentRound =
        state.roundHintUsedBy === playerId && state.roundHintType === hintType;
      if (hintType === 'pollHint' && inventory.pollHintUsed && !sameHintAsCurrentRound) return;
      if (hintType === 'peekTwo' && inventory.peekTwoUsed && !sameHintAsCurrentRound) return;
      if (
        hintType === 'followPlayer' &&
        inventory.followPlayerUsed &&
        !sameHintAsCurrentRound
      ) {
        return;
      }

      const baseAiAnswers = buildBaseAiAnswers({
        activeIds: state.activeIds,
        humanPlayerId: state.humanPlayerId,
        seed: state.seed,
        roundNumber: state.roundNumber,
        question: state.currentQuestion,
        previousDistribution: state.previousDistribution,
        blockedAnswers: state.blockedAnswers,
      });

      if (hintType === 'followPlayer' && (!targetId || !state.activeIds.includes(targetId) || targetId === playerId)) {
        return;
      }

      state.roundHintUsedBy = playerId;
      state.roundHintType = hintType;
      state.roundHintTargetId = null;
      state.roundHintPollEstimate = null;
      state.roundHintPeekedAnswers = null;

      if (hintType === 'pollHint') {
        if (state.roundHintType !== 'pollHint' || !inventory.pollHintUsed) {
          inventory.pollHintUsed = true;
        }
        state.roundHintPollEstimate = buildPollEstimate(
          countAnswerDistribution(baseAiAnswers, state.currentQuestion.options),
          state.seed,
          state.roundNumber,
          playerId,
        );
        return;
      }

      if (hintType === 'peekTwo') {
        if (state.roundHintType !== 'peekTwo' || !inventory.peekTwoUsed) {
          inventory.peekTwoUsed = true;
        }
        state.roundHintPeekedAnswers = buildPeekPreview({
          activeIds: state.activeIds,
          viewerId: playerId,
          seed: state.seed,
          roundNumber: state.roundNumber,
          question: state.currentQuestion,
          baseAiAnswers,
          blockedAnswers: state.blockedAnswers,
        });
        return;
      }

      if (state.roundHintType !== 'followPlayer' || !inventory.followPlayerUsed) {
        inventory.followPlayerUsed = true;
      }
      state.roundHintTargetId = targetId;
      delete state.draftAnswers[playerId];
    },

    lockRound(state) {
      if (state.phase !== 'question' || !state.currentQuestion) return;
      if (humanNeedsManualAnswer(state)) {
        const humanId = state.humanPlayerId;
        if (!humanId || !state.draftAnswers[humanId]) return;
      }
      const humanId = state.humanPlayerId;
      const simulation = simulateMajorityRulesBallot({
        activeIds: state.activeIds,
        humanPlayerId: humanId,
        humanAnswer: humanId ? state.draftAnswers[humanId] ?? null : null,
        humanHint: getHumanHintPreview(state),
        inventories: state.hintInventories,
        seed: state.seed,
        roundNumber: state.roundNumber,
        question: state.currentQuestion,
        previousDistribution: state.previousDistribution,
        blockedAnswers: state.blockedAnswers,
      });

      if (!state.roundHintUsedBy && simulation.aiHintDecision) {
        state.roundHintUsedBy = simulation.aiHintDecision.playerId;
        state.roundHintType = simulation.aiHintDecision.type;
        state.roundHintTargetId = simulation.aiHintDecision.targetId ?? null;
        state.roundHintPollEstimate = simulation.aiHintDecision.pollEstimate ?? null;
        state.roundHintPeekedAnswers = simulation.aiHintDecision.peekedAnswers ?? null;
        const inventory = state.hintInventories[simulation.aiHintDecision.playerId];
        if (inventory) {
          if (simulation.aiHintDecision.type === 'pollHint') inventory.pollHintUsed = true;
          if (simulation.aiHintDecision.type === 'peekTwo') inventory.peekTwoUsed = true;
          if (simulation.aiHintDecision.type === 'followPlayer') inventory.followPlayerUsed = true;
        }
      }

      state.revealState = {
        result: resolveMajorityRulesBallot({
          activeIds: state.activeIds,
          answers: simulation.answers,
          question: state.currentQuestion,
          eliminationCount: 1,
        }),
        revoteNumber: state.revoteNumber,
      };

      state.phase = 'reveal';
    },

    advanceReveal(state) {
      if (state.phase !== 'reveal' || !state.revealState) return;
      const { result } = state.revealState;
      const repeatedThreeWayRevote =
        state.activeIds.length === 3 &&
        result.kind === 'revote' &&
        state.revoteNumber > 0 &&
        distributionsMatch(state.previousDistribution, result.distribution);

      state.previousDistribution = result.distribution;

      if (result.kind === 'revote') {
        if (repeatedThreeWayRevote) {
          state.roundNumber += 1;
          state.revoteNumber = 0;
          state.previousDistribution = null;
          state.blockedAnswers = {};
          prepareQuestion(state);
          state.phase = 'question';
          return;
        }
        if (state.activeIds.length === 3 && state.revoteNumber >= 2) {
          advanceToThreeWayDuel(state);
          return;
        }
        state.phase = 'question';
        state.revoteNumber += 1;
        state.blockedAnswers = { ...result.answers };
        state.draftAnswers = {};
        state.revealState = null;
        state.roundHintPollEstimate = null;
        state.roundHintPeekedAnswers = null;
        return;
      }

      if (result.kind === 'unanimous') {
        state.doubleEliminationArmed = false;
        state.roundNumber += 1;
        state.revoteNumber = 0;
        state.blockedAnswers = {};
        prepareQuestion(state);
        state.phase = 'question';
        return;
      }

      state.doubleEliminationArmed = false;
      state.revoteNumber = 0;
      state.blockedAnswers = {};
      for (const eliminatedId of result.eliminatedIds) {
        if (!state.eliminatedIds.includes(eliminatedId)) {
          state.eliminatedIds.push(eliminatedId);
        }
      }
      state.activeIds = state.activeIds.filter((playerId) => !result.eliminatedIds.includes(playerId));

      if (state.activeIds.length <= 1) {
        state.winnerId = state.activeIds[0] ?? null;
        state.phase = 'winner';
        return;
      }

      if (state.activeIds.length === 2) {
        advanceToFinalDuel(state);
        return;
      }

      state.roundNumber += 1;
      prepareQuestion(state);
      state.phase = 'question';
    },

    setFinalDuelPick(
      state,
      action: PayloadAction<{
        playerId: string;
        value: number;
      }>,
    ) {
      if (
        (state.phase !== 'final_duel_pick' && state.phase !== 'final_duel_roll') ||
        !state.finalDuel
      ) {
        return;
      }
      const { playerId, value } = action.payload;
      if (!state.finalDuel.finalists.includes(playerId) || value < 1 || value > 6) return;
      const takenByOther = state.finalDuel.finalists.some(
        (id) => id !== playerId && state.finalDuel?.chosenNumbers[id] === value,
      );
      if (takenByOther) return;
      state.finalDuel.chosenNumbers[playerId] = value;
      ensureAiFinalDuelPicks(state);
    },

    setThreeWayDuelPick(
      state,
      action: PayloadAction<{
        playerId: string;
        value: number;
      }>,
    ) {
      if (state.phase !== 'three_way_duel_pick' || !state.threeWayDuel) {
        return;
      }
      const { playerId, value } = action.payload;
      if (!state.threeWayDuel.finalists.includes(playerId) || value < 1 || value > 6) return;
      const takenByOther = state.threeWayDuel.finalists.some(
        (id) => id !== playerId && state.threeWayDuel?.chosenNumbers[id] === value,
      );
      if (takenByOther) return;
      state.threeWayDuel.chosenNumbers[playerId] = value;
      ensureAiThreeWayDuelPicks(state);
    },

    rollFinalDuel(state) {
      if (state.phase !== 'final_duel_roll' || !state.finalDuel) return;
      const allPicked = state.finalDuel.finalists.every(
        (finalistId) => state.finalDuel?.chosenNumbers[finalistId] != null,
      );
      if (!allPicked) return;
      const result = resolveDiceDuelRoll(state.finalDuel, state.seed);
      state.finalDuel = result.duel;
      if (result.winnerId) {
        state.winnerId = result.winnerId;
        state.phase = 'winner';
      }
    },

    rollThreeWayDuel(state) {
      if (state.phase !== 'three_way_duel_roll' || !state.threeWayDuel) return;
      const allPicked = state.threeWayDuel.finalists.every(
        (finalistId) => state.threeWayDuel?.chosenNumbers[finalistId] != null,
      );
      if (!allPicked) return;
      const result = resolveThreeWayDiceRoll(state.threeWayDuel, state.seed);
      state.threeWayDuel = result.duel;
      if (result.winnerId) {
        state.winnerId = result.winnerId;
        state.phase = 'winner';
        return;
      }
      if (result.eliminatedId && result.advancingIds) {
        if (!state.eliminatedIds.includes(result.eliminatedId)) {
          state.eliminatedIds.push(result.eliminatedId);
        }
        state.activeIds = state.activeIds.filter((playerId) => playerId !== result.eliminatedId);
        advanceToFinalDuel(state);
      }
    },

    advanceWinner(state) {
      if (state.phase !== 'winner') return;
      state.phase = 'complete';
    },

    markMajorityRulesOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    resetMajorityRules() {
      return initialState;
    },
  },
});

export const {
  initMajorityRules,
  advanceIntro,
  setHumanAnswer,
  useHint,
  lockRound,
  advanceReveal,
  setThreeWayDuelPick,
  setFinalDuelPick,
  rollThreeWayDuel,
  rollFinalDuel,
  advanceWinner,
  markMajorityRulesOutcomeResolved,
  resetMajorityRules,
} = majorityRulesSlice.actions;

export default majorityRulesSlice.reducer;
