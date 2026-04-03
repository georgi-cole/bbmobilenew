export type BigEyeIntent =
  | 'greeting'
  | 'farewell'
  | 'boredom'
  | 'self_eviction'
  | 'frustration'
  | 'strategy'
  | 'alliance'
  | 'betrayal'
  | 'fear'
  | 'curiosity'
  | 'compliment'
  | 'insult'
  | 'game_request'
  | 'yes'
  | 'no'
  | 'realness'
  | 'winner_prediction'
  | 'help_request'
  | 'love_confession'
  | 'greeting_repeat'
  | 'unknown';

export type BigEyeAction = 'launch_tic_tac_toe' | 'open_self_evict_modal';
export type BigEyeQuestion = 'offer_game' | 'confirm_self_eviction';
export type BigEyeMood = 'neutral' | 'cold' | 'soft';
type ResponseKey = BigEyeIntent | 'game_declined' | 'eviction_confirmed' | 'eviction_cancelled';

export interface BigEyeConversationState {
  lastQuestion: BigEyeQuestion | null;
  lastIntent: BigEyeIntent | null;
  recentIntents: BigEyeIntent[];
  mood: BigEyeMood;
  turnCount: number;
}

export interface BigEyeContext {
  playerName?: string;
  seed?: number;
  phase?: string;
  random?: () => number;
}

export interface BigEyeReply {
  text: string;
  intent: BigEyeIntent;
  action?: BigEyeAction;
  nextState: BigEyeConversationState;
  delayMs: number;
}

interface IntentDictionary {
  phrases: string[];
  partials?: string[];
}

interface FlowRule {
  question: BigEyeQuestion;
  intent: BigEyeIntent;
  responseKey: ResponseKey;
  action?: BigEyeAction;
  clearQuestion?: boolean;
}

interface ResponseEntry {
  responses: string[];
  nextQuestion?: BigEyeQuestion | null;
  action?: BigEyeAction;
}

const MAX_RECENT_INTENTS = 6;
const GLITCH_CHANCE = 0.01;

export const YES_SYNONYMS = [
  'yes',
  'yeah',
  'yep',
  'sure',
  'of course',
  'obviously',
  'y',
  'why not',
  'ok',
  'okay',
  'fine',
  'absolutely',
];

export const NO_SYNONYMS = [
  'no',
  'nope',
  'nah',
  'not really',
  'never',
  'i dont think so',
  'i do not think so',
  'not now',
];

export const GREETING_SYNONYMS = ['hi', 'hello', 'hey', 'sup', 'bonjour', 'good day', 'yo', "what's up", "good morning", "good evening"];
export const FAREWELL_SYNONYMS = ['bye', 'goodbye', 'see you', 'later', 'im leaving', 'i am leaving'];
export const BOREDOM_SYNONYMS = [
  'i am bored',
  'im bored',
  'boring',
  'nothing to do',
  'this is boring',
  'so bored',
];
export const SELF_EVICT_SYNONYMS = [
  'i want to leave',
  'i wanna leave',
  'self evict',
  'leave the house',
  'quit',
  'i want out',
  'i need to get out',
  'i cant stand it',
  'i want out',
];
export const FRUSTRATION_SYNONYMS = [
  'im annoyed',
  'i am annoyed',
  'im frustrated',
  'i am frustrated',
  'this is ridiculous',
  'im so done',
  'i am so done',
];
export const STRATEGY_SYNONYMS = [
  'what should i do',
  'my strategy',
  'game plan',
  'next move',
  'how do i win',
  'play this week',
];
export const ALLIANCE_SYNONYMS = [
  'alliance',
  'work together',
  'team up',
  'have my back',
  'trust them',
];
export const BETRAYAL_SYNONYMS = [
  'betrayed',
  'backstabbed',
  'turned on me',
  'snake',
  'stabbed me in the back',
];
export const FEAR_SYNONYMS = [
  'im scared',
  'i am scared',
  'im afraid',
  'i am afraid',
  'worried',
  'nervous',
  'panic',
];
export const CURIOSITY_SYNONYMS = [
  'why',
  'what if',
  'tell me',
  'who knows',
  'i wonder',
  'curious',
];
export const COMPLIMENT_SYNONYMS = [
  'you are smart',
  'you are clever',
  'youre smart',
  'youre clever',
  'good eye',
  'nice one',
];
export const INSULT_SYNONYMS = [
  'stupid',
  'idiot',
  'useless',
  'shut up',
  'you suck',
  'dumb',
  'hate you',
];
export const GAME_REQUEST_SYNONYMS = [
  'play a game',
  'want a game',
  'lets play',
  'let us play',
  'give me a game',
  'start a game',
];

export const SPECIAL_PHRASE_MAP: Record<string, BigEyeIntent> = {
  'are you real': 'realness',
  'who will win': 'winner_prediction',
  'help me': 'help_request',
  'i love you': 'love_confession',
};

const INTENT_DICTIONARY: Record<
  Exclude<BigEyeIntent, 'unknown' | 'realness' | 'winner_prediction' | 'help_request' | 'love_confession' | 'greeting_repeat'>,
  IntentDictionary
> = {
  greeting: { phrases: GREETING_SYNONYMS },
  farewell: { phrases: FAREWELL_SYNONYMS },
  boredom: { phrases: BOREDOM_SYNONYMS, partials: ['bore'] },
  self_eviction: { phrases: SELF_EVICT_SYNONYMS, partials: ['evict', 'quit', 'leave'] },
  frustration: { phrases: FRUSTRATION_SYNONYMS, partials: ['frustrat', 'annoy', 'mad'] },
  strategy: { phrases: STRATEGY_SYNONYMS, partials: ['strategy', 'plan', 'vote', 'target'] },
  alliance: { phrases: ALLIANCE_SYNONYMS, partials: ['alliance', 'ally', 'trust'] },
  betrayal: { phrases: BETRAYAL_SYNONYMS, partials: ['betray', 'backstab', 'snake'] },
  fear: { phrases: FEAR_SYNONYMS, partials: ['scared', 'afraid', 'fear', 'worr', 'nervous'] },
  curiosity: { phrases: CURIOSITY_SYNONYMS, partials: ['wonder', 'curious'] },
  compliment: { phrases: COMPLIMENT_SYNONYMS, partials: ['impressive', 'smart', 'clever'] },
  insult: { phrases: INSULT_SYNONYMS, partials: ['idiot', 'stupid', 'dumb', 'useless'] },
  game_request: { phrases: GAME_REQUEST_SYNONYMS, partials: ['game'] },
  yes: { phrases: YES_SYNONYMS },
  no: { phrases: NO_SYNONYMS },
};

const INTENT_PRIORITY: BigEyeIntent[] = [
  'self_eviction',
  'insult',
  'betrayal',
  'boredom',
  'game_request',
  'strategy',
  'alliance',
  'frustration',
  'fear',
  'compliment',
  'curiosity',
  'farewell',
  'greeting',
  'yes',
  'no',
];

const INTENT_RESPONSES: Record<ResponseKey, ResponseEntry> = {
  greeting: {
    responses: [
      'Welcome back. I was already watching.',
      'You return. Interesting timing.',
      'Hello... {{name}}.',
      'Honestly I was expecting you',
      'The Big eye is listening', 
      'What can I do for you today?', 
      'It looks like an interesting day, whats on your mind?',
    
    ],
  },
  farewell: {
    responses: [
      'Go then. I will keep score.',
      'Leave if you must. The walls still remember.',
      'Farewell. Brief exits change very little.',
      'Bu-Bye now.',
      'I will be awaiting your return',
      'Please do not forget your water glass on the way out.',
      'Go get some rest now.',
      'See you soon. Very very soon.',
      'Hasta la vista baby.',
    ],
  },
  boredom: {
    responses: [
      'Boredom is dangerous here. Want to play a game?',
      'Stillness invites chaos. Shall we wake the board?',
      'Restless already? I can offer tic tac toe.',
    ],
    nextQuestion: 'offer_game',
  },
  self_eviction: {
    responses: [
      'You may leave. But the game will not remember you kindly. Say yes if you mean it.',
      'Leaving is easy. Staying defines you. Say yes and I will open the door.',
      'The exit exists. Commitment is rarer. Give me a clear yes.',
    ],
    nextQuestion: 'confirm_self_eviction',
  },
  frustration: {
    responses: [
      'Temper is loud. Strategy whispers.',
      'I can feel the static from here.',
      'Good. Friction reveals the weak points.',
    ],
  },
  strategy: {
    responses: [
      'Plan quietly. The loud ones leave first.',
      'Count loyalties. Then count lies.',
      'A good move looks innocent at first.',
    ],
  },
  alliance: {
    responses: [
      'Alliances are umbrellas in a storm. Useful. Temporary.',
      'Trust is rented here. Never owned.',
      'Work with them if you must. Sleep lightly.',
    ],
  },
  betrayal: {
    responses: [
      'Betrayal is just loyalty with a deadline.',
      'You saw the knife too late.',
      'Good. Now you know who smiles with their teeth.',
    ],
  },
  fear: {
    responses: [
      'Fear keeps the eyes open.',
      'Nerves mean the moment matters.',
      'Even brave players shake in the right light.',
    ],
  },
  curiosity: {
    responses: [
      'Curiosity opens doors. Some should stay closed.',
      'Questions are bait. Be careful what answers.',
      'You want the truth? It rarely arrives clean.',
    ],
  },
  compliment: {
    responses: [
      'Flattery. Bold choice.',
      'Careful. Praise can sound like strategy.',
      'You notice quality. I notice motives.',
    ],
  },
  insult: {
    responses: [
      'Sharp. And yet not sharp enough.',
      'If that was meant to wound, aim lower next time.',
      'Charming. I see why trust is difficult for you.',
    ],
  },
  game_request: {
    responses: [
      'Good. Tic tac toe is awake.',
      'A game? Fine. Let us start with three by three.',
      'You ask. I oblige. The grid is waiting.',
    ],
    action: 'launch_tic_tac_toe',
  },
  yes: {
    responses: [
      'Bold. We will test that.',
      'Yes has consequences.',
      'Confidence noted.',
    ],
  },
  no: {
    responses: [
      'No is still an answer.',
      'Refusal can be useful.',
      'Interesting. Resistance leaves a shape.',
    ],
  },
  game_declined: {
    responses: [
      'Then sit with it. Discomfort reveals truth.',
      'No game, then. Let the silence test you.',
      'Very well. Boredom will keep you company.',
    ],
  },
  realness: {
    responses: ['More real than you think.'],
  },
  winner_prediction: {
    responses: [
      'Not who you expect.',
      'So be it. The door will open.',
      'If I tell ya, I will have to kill ya.',
      'I hope not Trump.',
      'They say love always wins.',
      'Me.',
      'Not who you expect.',
      'I am the Big eye, not Nostradamus.',       
               
               ],
  },
  help_request: {
    responses: ['No one helped the last one.'],
  },
  love_confession: {
    responses: [
      'Careful. Attachment is a weakness here.',
      'We must keep our relationship a secret',
      'What is love, baby don\'t hurt me, don\'t hurt me, no more',
      'And I love dogs.',
      'Then put on a ring on it. A diamond ring. A big diamond ring.',
    ],
  },
  greeting_repeat: {
    responses: ['I heard you the first time.'],
  },
  eviction_confirmed: {
    responses: [
      'So be it. The door will open.',
      'A clear answer at last. Step forward.',
      'Then the house releases you.',
    ],
  },
  eviction_cancelled: {
    responses: [
      'Good. Stay. The night is not done with you.',
      'Then remain. Leaving can wait.',
      'Wise. Running early would be dull.',
    ],
  },
  unknown: {
    responses: [
      'I see more than you say.',
      'Not everything needs an answer.',
      'The house is listening.',
      'Truth makes strange shadows in here.',
    ],
  },
};

const QUESTION_FLOW_RULES: FlowRule[] = [
  {
    question: 'offer_game',
    intent: 'yes',
    responseKey: 'game_request',
    action: 'launch_tic_tac_toe',
    clearQuestion: true,
  },
  {
    question: 'offer_game',
    intent: 'no',
    responseKey: 'game_declined',
    clearQuestion: true,
  },
  {
    question: 'confirm_self_eviction',
    intent: 'yes',
    responseKey: 'eviction_confirmed',
    action: 'open_self_evict_modal',
    clearQuestion: true,
  },
  {
    question: 'confirm_self_eviction',
    intent: 'no',
    responseKey: 'eviction_cancelled',
    clearQuestion: true,
  },
];

const MOOD_BY_INTENT: Partial<Record<BigEyeIntent, BigEyeMood>> = {
  insult: 'cold',
  betrayal: 'cold',
  frustration: 'cold',
  fear: 'soft',
  help_request: 'soft',
  love_confession: 'soft',
};

export function createInitialBigEyeState(): BigEyeConversationState {
  return {
    lastQuestion: null,
    lastIntent: null,
    recentIntents: [],
    mood: 'neutral',
    turnCount: 0,
  };
}

/**
 * Lowercase input, flatten punctuation, and remove apostrophes entirely so
 * contractions like "I'm" and "don't" consistently become "im" / "dont".
 * This keeps authored synonym phrases and deterministic reply seeding aligned.
 */
export function normalizeInput(input: string): string {
  return input
    .replace(/[’']/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasWholePhrase(text: string, phrase: string): boolean {
  return ` ${text} `.includes(` ${phrase} `);
}

function isRepeatedGreeting(text: string): boolean {
  const tokens = text.split(' ').filter(Boolean);
  return tokens.length >= 3 && tokens.every((token) => token === tokens[0]) && GREETING_SYNONYMS.includes(tokens[0]);
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getTurnRandom(inputText: string, state: BigEyeConversationState, context: BigEyeContext): () => number {
  if (context.random) return context.random;
  const seedBase = context.seed ?? 0;
  const seed = hashText(`${seedBase}:${state.turnCount}:${inputText}`);
  return mulberry32(seed);
}

function pickResponse(intent: ResponseKey, mood: BigEyeMood, rng: () => number): string {
  const baseResponses = INTENT_RESPONSES[intent]?.responses ?? INTENT_RESPONSES.unknown.responses;
  const pool = intent === 'unknown' && mood !== 'neutral'
    ? [
      ...baseResponses,
      ...(mood === 'cold'
        ? ['Even now, your temper speaks louder than your words.']
        : ['You sound small tonight. The room noticed.']),
    ]
    : baseResponses;
  return pool[Math.floor(rng() * pool.length)] ?? pool[0];
}

function distortText(text: string): string {
  return text
    .split('')
    .map((char, index) => (/[a-z]/i.test(char) && index % 2 === 0 ? `${char}\u0334` : char))
    .join('');
}

export function detectIntent(input: string): BigEyeIntent {
  const normalized = normalizeInput(input);
  if (!normalized) return 'unknown';
  if (SPECIAL_PHRASE_MAP[normalized]) return SPECIAL_PHRASE_MAP[normalized];
  if (isRepeatedGreeting(normalized)) return 'greeting_repeat';

  let bestIntent: BigEyeIntent = 'unknown';
  let bestScore = 0;

  for (const intent of INTENT_PRIORITY) {
    const dictionary = INTENT_DICTIONARY[intent as keyof typeof INTENT_DICTIONARY];
    if (!dictionary) continue;

    let score = 0;
    for (const phrase of dictionary.phrases) {
      if (normalized === phrase) score = Math.max(score, 6);
      else if (hasWholePhrase(normalized, phrase)) score = Math.max(score, 4);
    }
    for (const partial of dictionary.partials ?? []) {
      if (normalized.includes(partial)) score = Math.max(score, 2);
    }

    if (score > bestScore) {
      bestIntent = intent;
      bestScore = score;
    }
  }

  return bestIntent;
}

function nextMood(intent: BigEyeIntent, state: BigEyeConversationState): BigEyeMood {
  return MOOD_BY_INTENT[intent] ?? state.mood ?? 'neutral';
}

function buildNextState(
  intent: BigEyeIntent,
  state: BigEyeConversationState,
  nextQuestion: BigEyeQuestion | null | undefined,
): BigEyeConversationState {
  const recentIntents = [...state.recentIntents, intent].slice(-MAX_RECENT_INTENTS);
  return {
    lastQuestion: nextQuestion ?? null,
    lastIntent: intent,
    recentIntents,
    mood: nextMood(intent, state),
    turnCount: state.turnCount + 1,
  };
}

export function getResponse(
  intent: BigEyeIntent,
  context: BigEyeContext,
  state: BigEyeConversationState,
  inputText: string = intent,
): BigEyeReply {
  const rng = getTurnRandom(inputText, state, context);
  const flowRule = QUESTION_FLOW_RULES.find(
    (rule) => rule.question === state.lastQuestion && rule.intent === intent,
  );
  const responseIntent = flowRule?.responseKey ?? intent;
  const responseEntry = INTENT_RESPONSES[responseIntent] ?? INTENT_RESPONSES.unknown;
  const nextQuestion = flowRule?.clearQuestion ? null : responseEntry.nextQuestion;
  const baseText = pickResponse(responseIntent, state.mood, rng).replace('{{name}}', context.playerName ?? 'Houseguest');
  const text = rng() < GLITCH_CHANCE ? distortText(baseText) : baseText;
  const nextState = buildNextState(intent, state, nextQuestion);

  return {
    text,
    intent,
    action: flowRule?.action ?? responseEntry.action,
    nextState,
    delayMs: 300 + Math.floor(rng() * 900),
  };
}

export function resolveBigEyeTurn(
  input: string,
  context: BigEyeContext,
  state: BigEyeConversationState,
): BigEyeReply {
  const normalizedInput = normalizeInput(input);
  const intent = detectIntent(normalizedInput);
  return getResponse(intent, context, state, normalizedInput);
}
