import { mulberry32 } from '../../store/rng';
import { MAJORITY_RULES_QUESTION_BANK } from './majorityRulesQuestions';

export type MajorityRulesHintType = 'pollHint' | 'peekTwo' | 'followPlayer';

export interface MajorityRulesQuestionOption {
  id: string;
  label: string;
  text: string;
  baseBias: number;
}

export interface MajorityRulesQuestion {
  id: string;
  prompt: string;
  options: [MajorityRulesQuestionOption, MajorityRulesQuestionOption, MajorityRulesQuestionOption];
}

export interface MajorityRulesHintInventory {
  peekTwoUsed: boolean;
  followPlayerUsed: boolean;
}

export interface MajorityRulesHintPreview {
  type: MajorityRulesHintType;
  pollEstimate?: Record<string, number>;
  peekedAnswers?: Record<string, string>;
  targetId?: string | null;
}

export interface MajorityRulesAiHintDecision extends MajorityRulesHintPreview {
  playerId: string;
}

export interface MajorityRulesRoundSimulation {
  answers: Record<string, string>;
  distribution: Record<string, number>;
  aiHintDecision: MajorityRulesAiHintDecision | null;
}

export interface MajorityRulesBallotResolution {
  kind: 'unanimous' | 'revote' | 'elimination';
  distribution: Record<string, number>;
  answers: Record<string, string>;
  eliminatedIds: string[];
  minorityOptionId: string | null;
  tiedOptionIds: string[];
  eliminationCount: number;
}

export interface MajorityRulesDiceDuelState {
  finalists: [string, string];
  chosenNumbers: Record<string, number | null>;
  currentRollerId: string;
  pressureHolderId: string | null;
  roundCount: number;
  suddenDeath: boolean;
  turnCount: number;
  lastRoll: {
    playerId: string;
    value: number;
    hitTarget: boolean;
    cancelled: boolean;
    winnerId: string | null;
  } | null;
}

export interface MajorityRulesDiceRollResult {
  duel: MajorityRulesDiceDuelState;
  winnerId: string | null;
}

const AI_MINORITY_CHANCE = 0.13;
const AI_HINT_USAGE_CHANCE = 0.18;
const POLL_HINT_WEIGHT = 0.3;
const PEEK_HINT_WEIGHT = 0.35;
const PREVIOUS_TREND_WEIGHT = 0.6;
const PERSONALITY_WEIGHT = 0.18;
const NOISE_WEIGHT = 0.16;
const MAX_SUDDEN_DEATH_ROUNDS = 10;
const MAJORITY_RULES_OPTION_IDS = ['a', 'b', 'c'] as const;
const MAJORITY_RULES_OPTION_LABELS = ['A', 'B', 'C'] as const;
const MAJORITY_RULES_OPTION_BIASES = [0.94, 0.72, 0.46] as const;

function buildMajorityRulesQuestion(
  id: string,
  prompt: string,
  options: [string, string, string],
): MajorityRulesQuestion {
  return {
    id,
    prompt,
    options: options.map((text, index) => ({
      id: MAJORITY_RULES_OPTION_IDS[index],
      label: MAJORITY_RULES_OPTION_LABELS[index],
      text,
      baseBias: MAJORITY_RULES_OPTION_BIASES[index],
    })) as [
      MajorityRulesQuestionOption,
      MajorityRulesQuestionOption,
      MajorityRulesQuestionOption,
    ],
  };
}

function shuffleMajorityRulesQuestion(
  question: MajorityRulesQuestion,
  seed: number,
  roundNumber: number,
  usedQuestionIds: string[],
): MajorityRulesQuestion {
  const shuffledOptions = question.options
    .map((option) => ({
      option,
      sortKey: seededValue(
        seed,
        'question-option',
        roundNumber,
        question.id,
        usedQuestionIds.join('|'),
        option.id,
      ),
    }))
    .sort((left, right) => left.sortKey - right.sortKey || left.option.id.localeCompare(right.option.id))
    .map(({ option }, index) => ({
      ...option,
      id: MAJORITY_RULES_OPTION_IDS[index],
      label: MAJORITY_RULES_OPTION_LABELS[index],
    })) as [MajorityRulesQuestionOption, MajorityRulesQuestionOption, MajorityRulesQuestionOption];

  return {
    ...question,
    options: shuffledOptions,
  };
}

export const MAJORITY_RULES_QUESTIONS: MajorityRulesQuestion[] = MAJORITY_RULES_QUESTION_BANK.map(
  (question) => buildMajorityRulesQuestion(question.id, question.prompt, question.options),
);

export function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function seededValue(seed: number, ...parts: Array<number | string>): number {
  let mixed = seed >>> 0;
  for (const part of parts) {
    const piece = typeof part === 'number' ? part >>> 0 : fnv1a32(part);
    mixed = (mixed ^ piece ^ Math.imul(piece, 0x9e3779b9)) >>> 0;
  }
  return mixed >>> 0;
}

function seededRng(seed: number, ...parts: Array<number | string>) {
  return mulberry32(seededValue(seed, ...parts));
}

function getAllowedOptionIds(
  options: readonly MajorityRulesQuestionOption[],
  blockedAnswer: string | null | undefined,
): string[] {
  const ids = options.map((option) => option.id);
  if (!blockedAnswer) return ids;
  const filtered = ids.filter((id) => id !== blockedAnswer);
  return filtered.length > 0 ? filtered : ids;
}

function buildPreviousTrend(previousDistribution: Record<string, number> | null | undefined) {
  const total = Object.values(previousDistribution ?? {}).reduce((sum, count) => sum + count, 0);
  return (optionId: string) => {
    if (!previousDistribution || total <= 0) return 0;
    return (previousDistribution[optionId] ?? 0) / total;
  };
}

function chooseExtremaOption(
  scores: Record<string, number>,
  optionIds: string[],
  pickMinority: boolean,
): string {
  const sorted = [...optionIds].sort((left, right) =>
    pickMinority ? scores[left] - scores[right] : scores[right] - scores[left],
  );
  return sorted[0] ?? optionIds[0];
}

function buildPlayerScores(params: {
  seed: number;
  roundNumber: number;
  playerId: string;
  question: MajorityRulesQuestion;
  previousDistribution?: Record<string, number> | null;
  blockedAnswer?: string | null;
}) {
  const { seed, roundNumber, playerId, question, previousDistribution, blockedAnswer } = params;
  const optionIds = getAllowedOptionIds(question.options, blockedAnswer);
  const prevTrend = buildPreviousTrend(previousDistribution);
  const rng = seededRng(seed, 'player-choice', roundNumber, playerId, question.id);
  const scores: Record<string, number> = {};

  for (const option of question.options) {
    if (!optionIds.includes(option.id)) continue;
    const personalBias =
      (((fnv1a32(`${playerId}:${option.id}`) % 1000) / 1000) - 0.5) * PERSONALITY_WEIGHT;
    const noise = (rng() - 0.5) * NOISE_WEIGHT;
    scores[option.id] =
      option.baseBias + (prevTrend(option.id) * PREVIOUS_TREND_WEIGHT) + personalBias + noise;
  }

  return { optionIds, scores, rng };
}

export function chooseAiAnswer(params: {
  seed: number;
  roundNumber: number;
  playerId: string;
  question: MajorityRulesQuestion;
  previousDistribution?: Record<string, number> | null;
  blockedAnswer?: string | null;
}): string {
  const { optionIds, scores, rng } = buildPlayerScores(params);
  const pickMinority = rng() < AI_MINORITY_CHANCE;
  return chooseExtremaOption(scores, optionIds, pickMinority);
}

export function countAnswerDistribution(
  answers: Record<string, string>,
  options: readonly MajorityRulesQuestionOption[],
): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const option of options) {
    distribution[option.id] = 0;
  }
  for (const answer of Object.values(answers)) {
    if (distribution[answer] !== undefined) distribution[answer] += 1;
  }
  return distribution;
}

export function buildPollEstimate(
  exactDistribution: Record<string, number>,
  seed: number,
  roundNumber: number,
  viewerId: string,
): Record<string, number> {
  const total = Object.values(exactDistribution).reduce((sum, count) => sum + count, 0);
  if (total <= 0) return Object.fromEntries(Object.keys(exactDistribution).map((key) => [key, 0]));
  const rng = seededRng(seed, 'poll-hint', roundNumber, viewerId);
  const adjusted = Object.entries(exactDistribution).map(([optionId, count]) => {
    const exactPercent = (count / total) * 100;
    const noise = (rng() - 0.5) * 14;
    return {
      optionId,
      value: Math.max(3, Math.min(94, exactPercent + noise)),
    };
  });
  const sum = adjusted.reduce((acc, entry) => acc + entry.value, 0) || 1;
  const normalized = adjusted.map((entry) => ({
    optionId: entry.optionId,
    value: Math.round((entry.value / sum) * 100),
  }));
  const diff = 100 - normalized.reduce((acc, entry) => acc + entry.value, 0);
  if (normalized.length > 0) {
    normalized[0].value += diff;
  }
  return Object.fromEntries(normalized.map((entry) => [entry.optionId, entry.value]));
}

export function buildBaseAiAnswers(params: {
  activeIds: string[];
  humanPlayerId: string | null;
  seed: number;
  roundNumber: number;
  question: MajorityRulesQuestion;
  previousDistribution?: Record<string, number> | null;
  blockedAnswers?: Record<string, string>;
}): Record<string, string> {
  const {
    activeIds,
    humanPlayerId,
    seed,
    roundNumber,
    question,
    previousDistribution,
    blockedAnswers = {},
  } = params;
  const answers: Record<string, string> = {};
  for (const playerId of activeIds) {
    if (playerId === humanPlayerId) continue;
    answers[playerId] = chooseAiAnswer({
      seed,
      roundNumber,
      playerId,
      question,
      previousDistribution,
      blockedAnswer: blockedAnswers[playerId] ?? null,
    });
  }
  return answers;
}

function chooseAiHintDecision(params: {
  activeIds: string[];
  humanPlayerId: string | null;
  seed: number;
  roundNumber: number;
  question: MajorityRulesQuestion;
  inventories: Record<string, MajorityRulesHintInventory>;
  baseAiAnswers: Record<string, string>;
  blockedAnswers?: Record<string, string>;
  humanHintUsed: boolean;
}): MajorityRulesAiHintDecision | null {
  const {
    activeIds,
    humanPlayerId,
    seed,
    roundNumber,
    question,
    inventories,
    baseAiAnswers,
    blockedAnswers = {},
    humanHintUsed,
  } = params;
  if (humanHintUsed) return null;

  for (const playerId of activeIds) {
    if (playerId === humanPlayerId) continue;
    const rng = seededRng(seed, 'ai-hint', roundNumber, playerId, question.id);
    if (rng() >= AI_HINT_USAGE_CHANCE) continue;
    const inventory = inventories[playerId] ?? { peekTwoUsed: false, followPlayerUsed: false };
    const availableTypes: MajorityRulesHintType[] = ['pollHint'];
    if (!inventory.peekTwoUsed) availableTypes.push('peekTwo');
    if (!inventory.followPlayerUsed) availableTypes.push('followPlayer');
    const type = availableTypes[Math.floor(rng() * availableTypes.length)] ?? 'pollHint';

    if (type === 'pollHint') {
      const distribution = countAnswerDistribution(baseAiAnswers, question.options);
      return {
        playerId,
        type,
        pollEstimate: buildPollEstimate(distribution, seed, roundNumber, playerId),
      };
    }

    const otherIds = activeIds.filter((id) => id !== playerId);
    if (type === 'peekTwo') {
      const peekedAnswers: Record<string, string> = {};
      const pool = [...otherIds];
      while (pool.length > 0 && Object.keys(peekedAnswers).length < 2) {
        const index = Math.floor(rng() * pool.length);
        const [targetId] = pool.splice(index, 1);
        if (!targetId) continue;
        const previewAnswer =
          baseAiAnswers[targetId] ??
          chooseAiAnswer({
            seed,
            roundNumber,
            playerId: targetId,
            question,
            blockedAnswer: blockedAnswers[targetId] ?? null,
          });
        peekedAnswers[targetId] = previewAnswer;
      }
      return { playerId, type, peekedAnswers };
    }

    const targetCandidates = otherIds.filter((id) => baseAiAnswers[id] !== undefined);
    if (targetCandidates.length === 0) return null;
    const targetId = targetCandidates[Math.floor(rng() * targetCandidates.length)] ?? null;
    return { playerId, type, targetId };
  }

  return null;
}

export function buildPeekPreview(params: {
  activeIds: string[];
  viewerId: string;
  seed: number;
  roundNumber: number;
  question: MajorityRulesQuestion;
  baseAiAnswers: Record<string, string>;
  blockedAnswers?: Record<string, string>;
}): Record<string, string> {
  const {
    activeIds,
    viewerId,
    seed,
    roundNumber,
    question,
    baseAiAnswers,
    blockedAnswers = {},
  } = params;
  const rng = seededRng(seed, 'peek-hint', roundNumber, viewerId, question.id);
  const pool = activeIds.filter((id) => id !== viewerId);
  const preview: Record<string, string> = {};
  while (pool.length > 0 && Object.keys(preview).length < 2) {
    const index = Math.floor(rng() * pool.length);
    const [targetId] = pool.splice(index, 1);
    if (!targetId) continue;
    preview[targetId] =
      baseAiAnswers[targetId] ??
      chooseAiAnswer({
        seed,
        roundNumber,
        playerId: targetId,
        question,
        blockedAnswer: blockedAnswers[targetId] ?? null,
      });
  }
  return preview;
}

function applyHintToAnswer(params: {
  seed: number;
  roundNumber: number;
  playerId: string;
  question: MajorityRulesQuestion;
  blockedAnswer?: string | null;
  baseAnswer: string;
  hint: MajorityRulesHintPreview | MajorityRulesAiHintDecision;
}): string {
  const { seed, roundNumber, playerId, question, blockedAnswer, baseAnswer, hint } = params;
  const allowedOptionIds = getAllowedOptionIds(question.options, blockedAnswer);
  if (hint.type === 'followPlayer') {
    return allowedOptionIds.includes(baseAnswer) ? baseAnswer : allowedOptionIds[0];
  }
  if (hint.type === 'peekTwo' && hint.peekedAnswers) {
    const tally: Record<string, number> = {};
    const { optionIds, scores } = buildPlayerScores({
      seed,
      roundNumber,
      playerId,
      question,
      blockedAnswer,
    });
    for (const optionId of allowedOptionIds) tally[optionId] = 0;
    for (const answer of Object.values(hint.peekedAnswers)) {
      if (tally[answer] !== undefined) tally[answer] += 1;
    }
    for (const optionId of optionIds) {
      scores[optionId] += (tally[optionId] ?? 0) * PEEK_HINT_WEIGHT;
    }
    return chooseExtremaOption(scores, optionIds, false);
  }
  if (hint.type === 'pollHint' && hint.pollEstimate) {
    const { optionIds, scores } = buildPlayerScores({
      seed,
      roundNumber,
      playerId,
      question,
      blockedAnswer,
    });
    for (const optionId of optionIds) {
      scores[optionId] += ((hint.pollEstimate[optionId] ?? 0) / 100) * POLL_HINT_WEIGHT;
    }
    return chooseExtremaOption(scores, optionIds, false);
  }
  return baseAnswer;
}

export function simulateMajorityRulesBallot(params: {
  activeIds: string[];
  humanPlayerId: string | null;
  humanAnswer?: string | null;
  humanHint?: MajorityRulesHintPreview | null;
  inventories: Record<string, MajorityRulesHintInventory>;
  seed: number;
  roundNumber: number;
  question: MajorityRulesQuestion;
  previousDistribution?: Record<string, number> | null;
  blockedAnswers?: Record<string, string>;
}): MajorityRulesRoundSimulation {
  const {
    activeIds,
    humanPlayerId,
    humanAnswer,
    humanHint,
    inventories,
    seed,
    roundNumber,
    question,
    previousDistribution,
    blockedAnswers = {},
  } = params;

  const baseAiAnswers = buildBaseAiAnswers({
    activeIds,
    humanPlayerId,
    seed,
    roundNumber,
    question,
    previousDistribution,
    blockedAnswers,
  });
  const aiHintDecision = chooseAiHintDecision({
    activeIds,
    humanPlayerId,
    seed,
    roundNumber,
    question,
    inventories,
    baseAiAnswers,
    blockedAnswers,
    humanHintUsed: humanHint != null,
  });
  const answers: Record<string, string> = { ...baseAiAnswers };

  if (aiHintDecision) {
    const inventoryBlockedAnswer = blockedAnswers[aiHintDecision.playerId] ?? null;
    if (aiHintDecision.type === 'followPlayer' && aiHintDecision.targetId) {
      const copiedAnswer = answers[aiHintDecision.targetId];
      if (copiedAnswer) {
        answers[aiHintDecision.playerId] = applyHintToAnswer({
          seed,
          roundNumber,
          playerId: aiHintDecision.playerId,
          question,
          blockedAnswer: inventoryBlockedAnswer,
          baseAnswer: copiedAnswer,
          hint: aiHintDecision,
        });
      }
    } else if (aiHintDecision.type === 'peekTwo' || aiHintDecision.type === 'pollHint') {
      answers[aiHintDecision.playerId] = applyHintToAnswer({
        seed,
        roundNumber,
        playerId: aiHintDecision.playerId,
        question,
        blockedAnswer: inventoryBlockedAnswer,
        baseAnswer: answers[aiHintDecision.playerId],
        hint: aiHintDecision,
      });
    }
  }

  if (humanPlayerId && activeIds.includes(humanPlayerId)) {
    const blockedAnswer = blockedAnswers[humanPlayerId] ?? null;
    const allowedOptionIds = getAllowedOptionIds(question.options, blockedAnswer);
    if (humanHint?.type === 'followPlayer' && humanHint.targetId) {
      const copiedAnswer = answers[humanHint.targetId];
      if (copiedAnswer) {
        answers[humanPlayerId] = applyHintToAnswer({
          seed,
          roundNumber,
          playerId: humanPlayerId,
          question,
          blockedAnswer,
          baseAnswer: copiedAnswer,
          hint: humanHint,
        });
      }
    } else if (humanAnswer && allowedOptionIds.includes(humanAnswer)) {
      answers[humanPlayerId] = humanAnswer;
    } else if (humanAnswer) {
      answers[humanPlayerId] = allowedOptionIds[0];
    }
  }

  return {
    answers,
    distribution: countAnswerDistribution(answers, question.options),
    aiHintDecision,
  };
}

export function resolveMajorityRulesBallot(params: {
  activeIds: string[];
  answers: Record<string, string>;
  question: MajorityRulesQuestion;
  eliminationCount: number;
  seed: number;
  roundNumber: number;
}): MajorityRulesBallotResolution {
  const { activeIds, answers, question, eliminationCount } = params;
  const distribution = countAnswerDistribution(answers, question.options);
  const populatedOptionIds = question.options
    .map((option) => option.id)
    .filter((optionId) => (distribution[optionId] ?? 0) > 0);

  if (populatedOptionIds.length <= 1) {
    return {
      kind: 'unanimous',
      distribution,
      answers,
      eliminatedIds: [],
      minorityOptionId: populatedOptionIds[0] ?? null,
      tiedOptionIds: [],
      eliminationCount,
    };
  }

  const minCount = Math.min(...populatedOptionIds.map((optionId) => distribution[optionId] ?? 0));
  const tiedOptionIds = populatedOptionIds.filter((optionId) => (distribution[optionId] ?? 0) === minCount);
  if (tiedOptionIds.length !== 1) {
    if (tiedOptionIds.length < populatedOptionIds.length) {
      return {
        kind: 'elimination',
        distribution,
        answers,
        eliminatedIds: activeIds.filter((playerId) => tiedOptionIds.includes(answers[playerId] ?? '')),
        minorityOptionId: null,
        tiedOptionIds,
        eliminationCount,
      };
    }
    return {
      kind: 'revote',
      distribution,
      answers,
      eliminatedIds: [],
      minorityOptionId: null,
      tiedOptionIds,
      eliminationCount,
    };
  }

  const minorityOptionId = tiedOptionIds[0];
  const eliminatedIds = activeIds.filter((playerId) => answers[playerId] === minorityOptionId);

  return {
    kind: 'elimination',
    distribution,
    answers,
    eliminatedIds,
    minorityOptionId,
    tiedOptionIds: [],
    eliminationCount,
  };
}

export function pickMajorityRulesQuestion(
  seed: number,
  roundNumber: number,
  usedQuestionIds: string[],
): MajorityRulesQuestion {
  const remaining = MAJORITY_RULES_QUESTIONS.filter((question) => !usedQuestionIds.includes(question.id));
  const pool = remaining.length > 0 ? remaining : MAJORITY_RULES_QUESTIONS;
  const rng = seededRng(seed, 'question', roundNumber, usedQuestionIds.join('|'));
  const index = Math.floor(rng() * pool.length);
  const selectedQuestion = pool[index] ?? MAJORITY_RULES_QUESTIONS[0];
  return shuffleMajorityRulesQuestion(selectedQuestion, seed, roundNumber, usedQuestionIds);
}

export function initializeDiceDuel(finalists: [string, string]): MajorityRulesDiceDuelState {
  return {
    finalists,
    chosenNumbers: {
      [finalists[0]]: null,
      [finalists[1]]: null,
    },
    currentRollerId: finalists[0],
    pressureHolderId: null,
    roundCount: 0,
    suddenDeath: false,
    turnCount: 0,
    lastRoll: null,
  };
}

export function pickAiDuelNumber(
  seed: number,
  playerId: string,
  takenNumbers: number[],
): number {
  const available = [1, 2, 3, 4, 5, 6].filter((value) => !takenNumbers.includes(value));
  const rng = seededRng(seed, 'duel-pick', playerId, takenNumbers.join(','));
  const index = Math.floor(rng() * available.length);
  return available[index] ?? available[0] ?? 1;
}

export function resolveDiceDuelRoll(
  duel: MajorityRulesDiceDuelState,
  seed: number,
): MajorityRulesDiceRollResult {
  const rollerId = duel.currentRollerId;
  const target = duel.chosenNumbers[rollerId];
  if (target == null) {
    return { duel, winnerId: null };
  }
  const otherId = duel.finalists.find((id) => id !== rollerId) ?? rollerId;
  const rng = seededRng(seed, 'duel-roll', duel.turnCount, duel.roundCount, rollerId);
  const value = Math.floor(rng() * 6) + 1;
  const hitTarget = value === target;

  let winnerId: string | null = null;
  let pressureHolderId = duel.pressureHolderId;
  let currentRollerId = otherId;
  let roundCount = duel.roundCount;
  let suddenDeath = duel.suddenDeath;
  let cancelled = false;

  if (suddenDeath) {
    if (hitTarget) winnerId = rollerId;
  } else if (pressureHolderId) {
    if (hitTarget) {
      cancelled = true;
      pressureHolderId = null;
      currentRollerId = otherId;
    } else {
      winnerId = pressureHolderId;
    }
  } else if (hitTarget) {
    pressureHolderId = rollerId;
    currentRollerId = otherId;
  }

  if (!winnerId && currentRollerId === duel.finalists[0]) {
    roundCount += 1;
    if (roundCount >= MAX_SUDDEN_DEATH_ROUNDS) {
      suddenDeath = true;
    }
  }

  return {
    winnerId,
    duel: {
      ...duel,
      currentRollerId,
      pressureHolderId,
      roundCount,
      suddenDeath,
      turnCount: duel.turnCount + 1,
      lastRoll: {
        playerId: rollerId,
        value,
        hitTarget,
        cancelled,
        winnerId,
      },
    },
  };
}
