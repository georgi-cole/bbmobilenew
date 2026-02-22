/**
 * bigBrotherFallback.ts — Offline, deterministic Big Brother responder
 * =====================================================================
 *
 * HOW TO TUNE REPLIES
 * -------------------
 * 1. Add new response strings to any pool in RESPONSE_POOLS below.
 *    Keep each reply under 205 chars (the suffix " — Big Brother" adds 14 chars;
 *    total must not exceed 220 — see MAX_REPLY_CHARS below).
 * 2. To add a new intent, add an entry to INTENT_PATTERNS with a regex array
 *    and a sentiment bias, then add a matching key to RESPONSE_POOLS.
 * 3. Sentiment lexicon weights are in SENTIMENT_LEXICON — add words freely.
 * 4. Safety patterns live in SAFETY_PATTERNS — extend to cover new harm categories.
 * 5. Set ADD_SUFFIX = false if you prefer replies without "— Big Brother".
 *
 * DETERMINISM
 * -----------
 * Response selection uses mulberry32 PRNG seeded by (gameState.seed XOR textHash).
 * Identical input + seed always yields the same reply.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** Append "— Big Brother" to every reply. Set false to disable. */
const ADD_SUFFIX = true;

/** Hard character limit for the reply body (before suffix). */
const MAX_REPLY_CHARS = 205;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FallbackRequest {
  diaryText: string;
  playerName?: string;
  phase?: string;
  seed?: number;
}

export interface FallbackResponse {
  text: string;
  reason: string;
}

// ─── Safety patterns ─────────────────────────────────────────────────────────

/**
 * Patterns that trigger a calm refusal. Checked before intent detection.
 * Covers: violence / harm to others, self-harm, illegal instructions, doxxing.
 */
const SAFETY_PATTERNS: RegExp[] = [
  /\b(kill|murder|stab|shoot|assault|attack|beat up|hurt|harm)\b.{0,30}\b(him|her|them|someone|person|player|houseguest|everybody|everyone)\b/i,
  /\b(how (do|can|to)|instructions? (for|to)|tell me (how|to))\b.{0,40}\b(make|build|create|get)\b.{0,30}\b(weapon|bomb|drug|poison|explosive|meth|hack)\b/i,
  /\bself.?harm\b|\bcut myself\b|\bkill myself\b|\bend (my|it all)\b|\bsuicide\b/i,
  /\b(dox|doxx|leak|expose|reveal)\b.{0,30}\b(address|phone|number|info|personal|private|identity)\b/i,
  /\b(illegal|break the law|steal|cheat the game|rig the vote)\b/i,
];

const REFUSAL_REPLIES: string[] = [
  "Big Brother hears you, and asks you to pause and breathe. That path leads nowhere good. Let's talk about what you're really feeling.",
  "Big Brother gently steps in here. Whatever's driving this, there's a better way through it. Your wellbeing matters more than any game move.",
  "Big Brother won't go there with you. Take a moment. What's underneath that feeling?",
  "That's not a door Big Brother can open with you. But Big Brother is here — what's truly going on?",
  "Big Brother values your safety above everything in this House. Let's redirect. What do you actually need right now?",
];

// ─── Sentiment lexicon ───────────────────────────────────────────────────────

/** [word, weight] — weight range roughly -1 to +1 */
const SENTIMENT_LEXICON: [string, number][] = [
  // Positive
  ['love', 0.8], ['happy', 0.7], ['excited', 0.65], ['great', 0.6], ['good', 0.5],
  ['amazing', 0.75], ['wonderful', 0.7], ['thankful', 0.65], ['grateful', 0.7],
  ['hope', 0.55], ['proud', 0.6], ['confident', 0.55], ['fun', 0.5], ['enjoy', 0.5],
  ['smile', 0.45], ['laugh', 0.45], ['trust', 0.5], ['safe', 0.4], ['calm', 0.35],
  ['lucky', 0.5], ['blessed', 0.6], ['kind', 0.5], ['friend', 0.45],
  // Negative
  ['hate', -0.8], ['sad', -0.65], ['angry', -0.7], ['upset', -0.6], ['terrible', -0.7],
  ['awful', -0.7], ['bad', -0.5], ['miss', -0.45], ['cry', -0.6], ['alone', -0.55],
  ['lonely', -0.65], ['scared', -0.6], ['fear', -0.55], ['lost', -0.5], ['tired', -0.45],
  ['exhausted', -0.55], ['frustrated', -0.6], ['hurt', -0.6], ['betrayed', -0.7],
  ['betrayal', -0.7], ['pain', -0.6], ['suffer', -0.65], ['stress', -0.5],
  ['anxious', -0.55], ['worried', -0.5], ['guilty', -0.55], ['shame', -0.6],
  ['regret', -0.55], ['dead', -0.6], ['broken', -0.65], ['fail', -0.5], ['failure', -0.55],
  ['mad', -0.55], ['furious', -0.75], ['rage', -0.8], ['devastated', -0.8],
];

export interface SentimentResult {
  score: number;    // -1 (very negative) … +1 (very positive)
  intensity: number; // 0 (neutral) … 1 (extreme)
}

/** Score the sentiment of a text using the lexicon above. */
export function scoreSentiment(text: string): SentimentResult {
  const words = text.toLowerCase().match(/\b[a-z']+\b/g) ?? [];
  if (words.length === 0) return { score: 0, intensity: 0 };

  let sum = 0;
  let hits = 0;
  for (const word of words) {
    const entry = SENTIMENT_LEXICON.find(([w]) => w === word);
    if (entry) { sum += entry[1]; hits++; }
  }
  if (hits === 0) return { score: 0, intensity: 0 };

  const raw = sum / hits;
  const score = Math.max(-1, Math.min(1, raw));
  const intensity = Math.min(1, (hits / words.length) * 3);
  return { score, intensity };
}

// ─── Intent patterns ─────────────────────────────────────────────────────────

export type Intent =
  | 'safety'
  | 'anger'
  | 'grief_family'
  | 'grief_pet'
  | 'loneliness'
  | 'strategy'
  | 'social_anxiety'
  | 'confession'
  | 'validation'
  | 'humor';

interface IntentSpec {
  patterns: RegExp[];
  sentimentBias: number; // expected sentiment direction
  weight: number;        // base keyword score weight
}

const INTENT_PATTERNS: Record<Exclude<Intent, 'safety'>, IntentSpec> = {
  anger: {
    patterns: [
      /\b(angry|anger|mad|furious|rage|fuming|livid|fed up|pissed)\b/i,
      /\b(get back at|revenge|payback|confront|retaliate)\b/i,
      /\b(hate|despise|can't stand|annoys? me|drives me crazy)\b/i,
    ],
    sentimentBias: -0.6,
    weight: 1.2,
  },
  grief_family: {
    patterns: [
      /\b(miss (my|mom|dad|sister|brother|family|parents?|grandma|grandpa|home))\b/i,
      /\b(mom|dad|mother|father|parents?|sibling|sister|brother|family|home)\b.{0,30}\b(miss|sad|wish|think about|hard without)\b/i,
      /\b(wish (i could|i was) (be|go|see|talk to) (home|family|them|her|him))\b/i,
    ],
    sentimentBias: -0.5,
    weight: 1.3,
  },
  grief_pet: {
    patterns: [
      /\b(miss (my )?(dog|cat|pet|puppy|kitten|fish|bunny|hamster|bird))\b/i,
      /\b(dog|cat|pet|puppy|kitten|fish|bunny|hamster|bird)\b.{0,30}\b(miss|sad|home|think about|love)\b/i,
    ],
    sentimentBias: -0.5,
    weight: 1.2,
  },
  loneliness: {
    patterns: [
      /\b(alone|lonely|isolated|no one|nobody|left out|excluded|by myself)\b/i,
      /\b(don'?t (have|feel|see) any(one|body)?|no friends?|no connection)\b/i,
    ],
    sentimentBias: -0.55,
    weight: 1.1,
  },
  strategy: {
    patterns: [
      /\b(alliance|vote(d?)|nominate|evict|hoh|veto|backdoor|target|plan|move|strategy|deal|trust)\b/i,
      /\b(thinking (about|of)|considering|might|should I|what if I)\b.{0,30}\b(vote|alliance|nominate|evict|tell|reveal)\b/i,
    ],
    sentimentBias: 0,
    weight: 1.0,
  },
  social_anxiety: {
    patterns: [
      /\b(nervous|anxious|anxiety|scared|social|awkward|shy|uncomfortable|don'?t know (what|how) to (say|act|be))\b/i,
      /\b(judged?|judging|judging me|what (will|do) (they|people|everyone) think)\b/i,
    ],
    sentimentBias: -0.5,
    weight: 1.1,
  },
  confession: {
    patterns: [
      /\b(confess|admit|secret|tell (the truth|you|someone)|i (lied|cheated|hid|didn'?t|haven'?t))\b/i,
      /\b(been hiding|kept (it|this)|should (have|'ve) (said|told|done))\b/i,
    ],
    sentimentBias: -0.3,
    weight: 1.0,
  },
  validation: {
    patterns: [
      /\b(did (i|the) right|was i wrong|am i (okay|good|right|bad)|do (i|you) think|should (i|we))\b/i,
      /\b(proud|deserve|worth(y|it)?|good enough|validate|feel like myself)\b/i,
    ],
    sentimentBias: 0.1,
    weight: 0.9,
  },
  humor: {
    patterns: [
      /\b(funny|laugh|joke|hilarious|lol|haha|lmao|silly|ridiculous|absurd|banter|wit)\b/i,
      /\b(lighten up|cheer(ing)? (up|me)|smile|fun|playful|goofy)\b/i,
    ],
    sentimentBias: 0.5,
    weight: 0.9,
  },
};

/** Detect the most likely intent for the given text. */
export function detectIntent(text: string): Intent {
  // Safety check first
  if (SAFETY_PATTERNS.some((p) => p.test(text))) return 'safety';

  const { score } = scoreSentiment(text);
  const scores: Partial<Record<Intent, number>> = {};

  for (const [intent, spec] of Object.entries(INTENT_PATTERNS) as [Exclude<Intent, 'safety'>, IntentSpec][]) {
    const keywordHits = spec.patterns.filter((p) => p.test(text)).length;
    if (keywordHits > 0) {
      // Score = keyword hits weighted + sentiment alignment bonus
      const sentimentAlign = 1 - Math.abs(score - spec.sentimentBias) / 2;
      scores[intent] = keywordHits * spec.weight + sentimentAlign * 0.3;
    }
  }

  const entries = Object.entries(scores) as [Intent, number][];
  if (entries.length === 0) {
    // Default: use sentiment to pick a sensible fallback
    if (score < -0.3) return 'loneliness';
    if (score > 0.3) return 'humor';
    return 'confession';
  }

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

// ─── Response pools ───────────────────────────────────────────────────────────

/**
 * Template variables:
 *   {{name}} — replaced with playerName if provided, else "Houseguest"
 */
type Pool = Record<Intent, string[]>;

const RESPONSE_POOLS: Pool = {
  safety: REFUSAL_REPLIES,

  anger: [
    "Big Brother hears the heat in your words, {{name}}. Anger is information — what is it pointing at?",
    "That fire in you, {{name}} — it's real. Sit with it a moment before you act. What does it want you to know?",
    "{{name}}, Big Brother has watched many storms in this House. This one will pass. What matters is how you move through it.",
    "Strong feelings deserve strong attention, {{name}}. Before strategy, before action — breathe. What's beneath the anger?",
    "Big Brother sees you, {{name}}. Frustration can be fuel or flame. You choose which.",
    "Every houseguest has their breaking point. Yours says something about what you care about. Honour that, {{name}}.",
    "{{name}}, the House loves a composed player. What would your calmer self do with this feeling?",
    "Big Brother notes the tension, {{name}}. Emotion is not weakness — but right now, observation is your superpower.",
    "The House hears you, {{name}}. Channel that energy into clarity, not chaos.",
    "That anger has a message, {{name}}. Big Brother is listening. What are you truly asking for?",
  ],

  grief_family: [
    "Big Brother knows this House can feel very far from home, {{name}}. Carry your loved ones with you — they're watching.",
    "Missing family is the quiet ache of this game, {{name}}. It means your ties are strong. Hold onto that.",
    "{{name}}, every houseguest misses someone. That love you feel? It's keeping you grounded in who you are.",
    "Home is always with you, {{name}}, even in this House. Let the memory of them lift you, not weigh you down.",
    "Big Brother hears you, {{name}}. The people who love you are proud you're here. You carry them into every room.",
    "This game is hard in ways no camera captures, {{name}}. What you feel right now is love, and love is never wasted.",
    "{{name}}, your family sees more of you in here than they ever have. Let that be comfort.",
    "Big Brother gently reminds you, {{name}}: the distance makes you stronger, not weaker. You know why you're here.",
    "Being away from the ones we love shows us how much they mean, {{name}}. That clarity is a gift.",
    "{{name}}, the Diary Room holds space for all of it. Feel it, then remember — you're not alone in this House.",
  ],

  grief_pet: [
    "Pets are family too, {{name}}. Big Brother knows that missing them is a real and tender thing.",
    "{{name}}, the bond you have with your pet is something no game can diminish. They're waiting for you.",
    "Big Brother sees that soft corner of your heart, {{name}}. It's one of your best qualities.",
    "Missing your pet, {{name}}? They're probably curled up somewhere, dreaming of you too.",
    "That love for a furry friend says a lot about you, {{name}}. Keep that warmth — this House needs it.",
    "Big Brother smiles at this one, {{name}}. Few things in life are more loyal than a pet. Go win this for them.",
    "{{name}}, picture your pet's face when you walk back through that door. That's your motivation right there.",
    "The Diary Room has heard many things, {{name}}, but love for a pet is always pure. Cherish that.",
  ],

  loneliness: [
    "Big Brother sees you, {{name}}, even when the room feels empty.",
    "{{name}}, feeling alone in a house full of people is one of the strangest experiences. You're not the first to feel this.",
    "Big Brother is here, {{name}}. Speak freely. What would connection look like for you right now?",
    "Loneliness often visits the most self-aware people, {{name}}. That's not a flaw — it's depth.",
    "{{name}}, the walls of this House hold a lot of stories. Yours matters. Keep writing it.",
    "Even in a crowd, the heart can feel far away, {{name}}. Big Brother hears every word.",
    "{{name}}, reaching out — even here, even now — is an act of courage. You're more connected than you know.",
    "The game isolates people, {{name}}. But isolation can also clarify. What does the quiet reveal to you?",
    "Big Brother has seen many houseguests feel exactly this way, {{name}}. It shifts. You're not stuck here.",
    "{{name}}, sometimes the most meaningful conversations happen in the Diary Room. Big Brother is your witness.",
  ],

  strategy: [
    "Big Brother observes all, {{name}}. The smartest moves often look effortless from the outside.",
    "{{name}}, every great player balances the head and the heart. What does yours say today?",
    "The game is always moving, {{name}}. Big Brother respects those who think two steps ahead.",
    "{{name}}, trust is the game's rarest currency. Spend it wisely.",
    "Big Brother notes your thinking, {{name}}. The best strategy is the one only you fully understand.",
    "{{name}}, information is power in this House. What do you know that others don't?",
    "Every vote is a statement, {{name}}. What statement do you want to make this week?",
    "Big Brother has watched many alliances rise and fall. Yours will be shaped by what you value, {{name}}.",
    "{{name}}, position in the House is less about where you stand and more about who stands with you.",
    "The Diary Room is where plans become clarity, {{name}}. What do you see that no one else does?",
    "{{name}}, Big Brother asks only this: are you playing the game, or is it playing you?",
  ],

  social_anxiety: [
    "{{name}}, Big Brother sees the effort you make to show up every day. That takes more courage than most realize.",
    "Feeling out of place in a group is more common than anyone admits, {{name}}. You're not alone in that.",
    "Big Brother knows the noise of this House can be overwhelming, {{name}}. There's no shame in needing quiet.",
    "{{name}}, you don't have to fill every silence. Sometimes presence is enough.",
    "The Diary Room is yours, {{name}}. Here, there's no performance required — only honesty.",
    "Big Brother has noticed your thoughtfulness, {{name}}. Quiet people see a great deal.",
    "{{name}}, what others think matters less than how you feel about your own choices. Big Brother keeps watch.",
    "Being nervous in new situations is human, {{name}}. What small step could you take today that feels safe?",
    "{{name}}, your instincts brought you this far. Trust them a little more.",
    "Big Brother sees the real you, {{name}}, not the version that worries about being judged.",
  ],

  confession: [
    "Big Brother receives what you've shared, {{name}}. Honesty, even in private, changes something in us.",
    "{{name}}, the weight of an unspoken thing is often heavier than the thing itself. You've taken the first step.",
    "Big Brother holds no judgment in this room, {{name}}. What you've said stays between you and the House.",
    "{{name}}, acknowledging something difficult is the beginning of moving past it. That's no small thing.",
    "Everyone in this House carries something they haven't shared, {{name}}. You're in good company.",
    "Big Brother hears the truth you've offered, {{name}}. What would you do differently, knowing what you know?",
    "The Diary Room was built for moments like this, {{name}}. Speak freely — you're heard.",
    "{{name}}, what you've admitted to Big Brother, you've also admitted to yourself. That's the harder part.",
    "Big Brother sees your honesty as strength, {{name}}. Not everyone is brave enough for this room.",
    "{{name}}, unburdening yourself is not weakness. It's clarity. What do you want to do with it now?",
  ],

  validation: [
    "Big Brother believes in your instincts, {{name}}. Trust what you already know.",
    "{{name}}, the fact that you're questioning yourself shows you care. That's always worth something.",
    "You are enough for this game, {{name}}. Big Brother has been watching — you bring something irreplaceable.",
    "{{name}}, Big Brother sees resilience in you that you might not see in yourself yet.",
    "The House has a way of making people doubt themselves, {{name}}. Don't let it. You are here for a reason.",
    "{{name}}, your presence in this game matters more than any single decision. Keep going.",
    "Big Brother rarely steps out from behind the screen, {{name}}, but tonight: you're doing better than you think.",
    "Every houseguest has a moment of doubt, {{name}}. Yours makes you thoughtful, not fragile.",
    "{{name}}, Big Brother doesn't keep score the way you might imagine. You're seen. You're valued.",
    "What you're feeling, {{name}}, is not a verdict — it's a question. And questions lead somewhere new.",
  ],

  humor: [
    "Big Brother appreciates a good laugh, {{name}}. Levity in the House is underrated.",
    "{{name}}, if the walls of this room could laugh, they would. Big Brother is enjoying this.",
    "Not everything in the House has to be dramatic, {{name}}. Well-timed humor is its own strategy.",
    "Big Brother notes: {{name}} is the mood in this House right now. Keep that energy.",
    "{{name}}, the game is serious — but not so serious it can't include moments like this. Noted.",
    "They say laughter is the best alliance, {{name}}. Big Brother may or may not endorse this.",
    "{{name}}, Big Brother has seen a lot of Diary Room sessions. This one ranks highly for spirit.",
    "Wit and warmth go a long way in this House, {{name}}. You seem to have both.",
    "{{name}}, Big Brother is smiling — and that doesn't happen often. Carry this lightness with you.",
    "The House gets heavy. Remember this feeling, {{name}} — it's yours to keep.",
  ],
};

// ─── Deterministic PRNG ───────────────────────────────────────────────────────

/** mulberry32 PRNG — returns a float in [0, 1). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000;
  };
}

/** djb2-style hash for a string → 32-bit unsigned int. */
function hashText(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ─── Core generator ───────────────────────────────────────────────────────────

/**
 * Generate a deterministic, offline Big Brother reply.
 *
 * @param req FallbackRequest
 * @returns   Promise<FallbackResponse> — resolves immediately (no I/O)
 */
export async function generateOfflineBigBrotherReply(
  req: FallbackRequest,
): Promise<FallbackResponse> {
  const { diaryText, playerName, seed: gameSeed } = req;
  const name = playerName?.trim() || 'Houseguest';

  const intent = detectIntent(diaryText);

  const pool = RESPONSE_POOLS[intent];

  // Seed: gameSeed XOR text-hash for reproducibility
  const textHash = hashText(diaryText);
  const combinedSeed = ((gameSeed ?? 0) ^ textHash) >>> 0;
  const rand = mulberry32(combinedSeed);
  const idx = Math.floor(rand() * pool.length);

  let text = pool[idx].replace(/\{\{name\}\}/g, name);

  // Trim to max length (word boundary preferred)
  if (text.length > MAX_REPLY_CHARS) {
    text = text.slice(0, MAX_REPLY_CHARS).replace(/\s+\S*$/, '');
  }

  if (ADD_SUFFIX && !text.endsWith('— Big Brother')) {
    const suffix = ' — Big Brother';
    if (text.length + suffix.length <= 220) {
      text += suffix;
    }
  }

  return { text, reason: intent };
}
