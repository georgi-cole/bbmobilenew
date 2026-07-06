import type { TwinShockPromptStage, TwinShockState, TwinShockStatus } from '../types';

export const TWIN_SHOCK_LIA_ID = 'lia';
export const TWIN_SHOCK_ALI_ID = 'ali';
export const TWIN_SHOCK_COMBINED_ID = 'lia_ali';

export type TwinShockAnswerIntent =
  | 'correct_twin_guess'
  | 'positive_lia_suspicion'
  | 'negative_lia_suspicion'
  | 'unknown_lia_suspicion'
  | 'give_up_confirmation'
  | 'unclear';

export interface TwinShockTurnContext {
  playerName: string;
  liaActive: boolean;
}

export interface TwinShockTurnResult {
  intent: TwinShockAnswerIntent;
  messages: string[];
  status: TwinShockStatus;
  promptStage: TwinShockPromptStage | null;
  retryCount: number;
  resolution?: 'resolved_discovered' | 'resolved_mission_success' | 'resolved_secret_lost';
}

const CORRECT_PATTERNS = [
  /\btwins?\b/,
  /\btwin sister\b/,
  /\bsisters?\b/,
  /\bsiblings?\b/,
  /\bidentical\b/,
  /\bdouble\b/,
  /\blookalike\b/,
  /\bdoppelganger\b/,
  /\bclone\b/,
  /\banother lia\b/,
  /\btwo lias\b/,
  /\btwo of her\b/,
  /\bsomeone else\b/,
  /\bswitch(?:ing)? places\b/,
  /\bswapp?ing\b/,
  /\bswap places\b/,
  /\bimpostou?r\b/,
  /\bnot the same lia\b/,
  /\bali\b/,
];

const GIVE_UP_PATTERNS = [
  /\bi give up\b/,
  /\bgive up\b/,
  /\bi surrender\b/,
  /\btell me\b/,
  /\breveal it\b/,
  /\bshow me\b/,
  /\bok(?:ay)?\b/,
  /\bfine\b/,
  /\bsure\b/,
  /\bi dont know\b/,
  /\bjust tell me\b/,
];

const POSITIVE_PATTERNS = [
  /\byes\b/,
  /\byeah\b/,
  /\byep\b/,
  /\bdefinitely\b/,
  /\bsomething is off\b/,
  /\bweird\b/,
  /\bacting strange\b/,
  /\bshe changed\b/,
  /\bshe is different\b/,
  /\bsuspicious\b/,
  /\bnot herself\b/,
  /\bi noticed\b/,
  /\bodd\b/,
];

const NEGATIVE_PATTERNS = [
  /\bno\b/,
  /\bnope\b/,
  /\bnothing\b/,
  /\bnot really\b/,
  /\bseems normal\b/,
  /\bhavent noticed\b/,
  /\bhave not noticed\b/,
  /\ball good\b/,
  /\bshe is fine\b/,
];

const UNKNOWN_PATTERNS = [
  /\bi dont know\b/,
  /\bidk\b/,
  /\bnot sure\b/,
  /\bmaybe\b/,
  /\bcant tell\b/,
  /\bunclear\b/,
  /\bhard to say\b/,
  /\bno idea\b/,
];

function normalizeTwinShockAnswer(input: string): string {
  return input
    .slice(0, 360)
    .replace(/[’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasNonNegatedCorrectGuess(text: string): boolean {
  if (!hasPattern(text, CORRECT_PATTERNS)) return false;

  if (/\bnot the same lia\b/.test(text)) return true;
  if (/\b(?:maybe|unless|could be|might be|is she|wait)\b.{0,40}\b(twins?|sisters?|ali|switch(?:ing)? places)\b/.test(text)) {
    return true;
  }
  if (/\b(?:i dont know|not sure|no idea)\b.{0,50}\b(?:maybe|unless|but|wait)\b.{0,50}\b(twins?|sisters?|ali|switch(?:ing)? places)\b/.test(text)) {
    return true;
  }
  if (/\b(?:dont|do not|doesnt|does not|isnt|is not|no)\b.{0,25}\b(twins?|sisters?|ali|switch(?:ing)? places)\b/.test(text)) {
    return false;
  }

  return true;
}

export function classifyTwinShockAnswer(input: string): TwinShockAnswerIntent {
  const text = normalizeTwinShockAnswer(input);
  if (!text) return 'unclear';
  if (hasNonNegatedCorrectGuess(text)) return 'correct_twin_guess';
  if (hasPattern(text, GIVE_UP_PATTERNS)) return 'give_up_confirmation';
  if (hasPattern(text, POSITIVE_PATTERNS)) return 'positive_lia_suspicion';
  if (hasPattern(text, NEGATIVE_PATTERNS)) return 'negative_lia_suspicion';
  if (hasPattern(text, UNKNOWN_PATTERNS)) return 'unknown_lia_suspicion';
  return 'unclear';
}

function unclearMessage(stage: TwinShockPromptStage | null, retryCount: number): string {
  if (stage === 'day5_final' || stage === 'day5_give_up') {
    return retryCount <= 0
      ? 'This is your final chance. Either make a guess, or say that you give up.'
      : 'The Big Eye needs a choice now. Make your guess, or say that you give up.';
  }
  return retryCount <= 0
    ? 'I need a clearer answer. Do you think something is off about Lia?'
    : 'Answer clearly, Houseguest. What exactly do you think is happening with Lia?';
}

export function createInitialTwinShockState(): TwinShockState {
  return {
    status: 'inactive',
    promptStage: null,
    queuedDay: null,
    retryCount: 0,
    cluesShownDays: [],
    pendingRevealAnimation: null,
  };
}

export function resolveTwinShockTurn(
  current: TwinShockState | undefined,
  input: string,
  context: TwinShockTurnContext,
): TwinShockTurnResult {
  const state = current ?? createInitialTwinShockState();
  const intent = classifyTwinShockAnswer(input);
  const playerName = context.playerName || 'Houseguest';
  const stage = state.promptStage;

  if (stage === 'secret_lost') {
    return {
      intent,
      messages: [
        'As Lia is no longer in the House, her secret will remain unrevealed.',
        'You are free to leave.',
      ],
      status: 'resolved_secret_lost',
      promptStage: null,
      retryCount: 0,
      resolution: 'resolved_secret_lost',
    };
  }

  if (intent === 'correct_twin_guess') {
    const late = stage === 'day5_final' || stage === 'day5_give_up';
    return {
      intent,
      messages: late
        ? [
          'Late, but sharp. You got it.',
          'Lia has been secretly switching places with her twin sister, Ali.',
          'Because you exposed the secret before it was completed, Lia and Ali will now continue as one contestant.',
          'You may return to the House and inform the others.',
        ]
        : [
          `Very good, ${playerName}. You saw what the House missed.`,
          'Lia has not been alone in this game. She has been secretly switching places with her twin sister, Ali.',
          'Because you exposed the secret, Lia and Ali will now continue as one contestant.',
          'Good job. You may return to the House and inform the others.',
        ],
      status: 'resolved_discovered',
      promptStage: null,
      retryCount: 0,
      resolution: 'resolved_discovered',
    };
  }

  if (stage === 'day4_initial' && intent === 'positive_lia_suspicion') {
    return {
      intent,
      messages: ['What exactly have you noticed?'],
      status: 'day4_pending',
      promptStage: 'day4_detail',
      retryCount: 0,
    };
  }

  if (stage === 'day4_initial' || stage === 'day4_detail') {
    if (intent === 'unclear' && state.retryCount < 1) {
      return {
        intent,
        messages: [unclearMessage(stage, state.retryCount)],
        status: 'day4_pending',
        promptStage: stage ?? 'day4_initial',
        retryCount: state.retryCount + 1,
      };
    }
    return {
      intent,
      messages: [
        'Interesting. Keep watching. Some secrets survive because people stop looking too soon.',
        'You may be called back tomorrow.',
      ],
      status: 'day4_asked_no_correct_guess',
      promptStage: null,
      retryCount: 0,
    };
  }

  if (stage === 'day5_final') {
    if (intent === 'unclear' && state.retryCount < 1) {
      return {
        intent,
        messages: [unclearMessage(stage, state.retryCount)],
        status: 'day4_asked_no_correct_guess',
        promptStage: 'day5_final',
        retryCount: state.retryCount + 1,
      };
    }
    return {
      intent,
      messages: ['Say that you give up, and I will tell you the secret.'],
      status: 'day4_asked_no_correct_guess',
      promptStage: 'day5_give_up',
      retryCount: 0,
    };
  }

  if (stage === 'day5_give_up') {
    if (intent === 'give_up_confirmation' || intent === 'unknown_lia_suspicion' || state.retryCount >= 1) {
      return {
        intent,
        messages: [
          'All right. I am not going to torture you anymore.',
          'Here is the secret.',
          'All along, Lia has been secretly switching places with her twin sister, Ali.',
          'Their secret mission was successful.',
          'Ali will now take over the first empty place in the House as a full contestant.',
          'You are free to return and inform the others.',
        ],
        status: 'resolved_mission_success',
        promptStage: null,
        retryCount: 0,
        resolution: 'resolved_mission_success',
      };
    }
    return {
      intent,
      messages: [unclearMessage(stage, state.retryCount)],
      status: 'day4_asked_no_correct_guess',
      promptStage: 'day5_give_up',
      retryCount: state.retryCount + 1,
    };
  }

  return {
    intent,
    messages: [unclearMessage(stage, state.retryCount)],
    status: state.status,
    promptStage: stage,
    retryCount: state.retryCount + 1,
  };
}
