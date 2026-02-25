/**
 * src/bb/engine.ts — Improved Big Brother rule-based engine
 * ==========================================================
 *
 * HOW TO TUNE
 * -----------
 * 1. Add new phrases to INTENT_SPECS[intent].phrases for high-priority matching.
 * 2. Add regex patterns to INTENT_SPECS[intent].patterns for broader coverage.
 * 3. Add words to SENTIMENT_LEXICON to improve scoring.
 * 4. Add templates to TEMPLATES[intent] — keep each under 205 chars (suffix adds 14).
 * 5. Adjust sentimentBias / weight per intent to shift scoring.
 *
 * NEGATION
 * --------
 * Tokens following a negator (not, no, never, don't, etc.) within a 3-token
 * window are marked as negated. Negated tokens invert their sentiment
 * contribution and suppress regex pattern matches.
 *
 * DETERMINISM
 * -----------
 * Reply selection uses mulberry32 PRNG seeded by (ctx.seed XOR hashText(input)).
 * Identical input + seed always yields the same reply. Pass lastReplyIds in
 * BBContext to avoid repeating recent replies.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntentId =
  | 'safety'
  | 'anger'
  | 'grief_family'
  | 'grief_pet'
  | 'loneliness'
  | 'strategy'
  | 'social_anxiety'
  | 'confession'
  | 'validation'
  | 'humor'
  | 'quit';

export interface SentimentResult {
  /** Normalised score: -1 (very negative) … +1 (very positive) */
  score: number;
  /** Intensity: 0 (neutral) … 1 (extreme) */
  intensity: number;
}

export interface ReplyTemplate {
  id: string;
  text: string; // {{name}} placeholder supported
}

export interface BBContext {
  /** Intents from recent turns — reserved for future cross-turn intent weighting */
  lastIntents?: IntentId[];
  /** Reply IDs from recent turns — avoided in selection */
  lastReplyIds?: string[];
  /**
   * Accumulated mood score (-1 … +1).
   * Incorporated into the PRNG seed to shift reply distribution based on the
   * player's ongoing emotional state (more negative mood → different pool slice).
   */
  moodScore?: number;
  /** Housemate names recently mentioned — reserved for future personalisation */
  recentNames?: string[];
  /** Player name for {{name}} substitution */
  playerName?: string;
  /** Seed for deterministic selection */
  seed?: number;
}

export interface EngineReply {
  text: string;
  intent: IntentId;
  sentiment: SentimentResult;
  replyId: string;
}

// ─── Negation ────────────────────────────────────────────────────────────────

const NEGATORS = new Set([
  'not', 'no', 'never', "don't", 'dont', "doesn't", 'doesnt',
  "didn't", 'didnt', "haven't", 'havent', "hasn't", 'hasnt',
  "can't", 'cant', "won't", 'wont', "isn't", 'isnt',
  "aren't", 'arent', "wasn't", 'wasnt', "weren't", 'werent',
  'neither', 'nor', 'barely', 'hardly', 'scarcely',
]);

/** Lower-case and strip punctuation except apostrophes. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // curly/prime quotes → straight
    .replace(/[^a-z0-9'\s]/g, ' ');
}

/** Split normalised text into tokens. */
export function tokenize(text: string): string[] {
  return normalize(text).split(/\s+/).filter(Boolean);
}

/**
 * Returns a boolean mask: mask[i] === true means token i is in the negation
 * window of a preceding negator (window = 3 tokens).
 */
function buildNegationMask(tokens: string[], windowSize = 3): boolean[] {
  const mask = new Array<boolean>(tokens.length).fill(false);
  for (let i = 0; i < tokens.length; i++) {
    if (NEGATORS.has(tokens[i])) {
      for (let j = i + 1; j <= Math.min(i + windowSize, tokens.length - 1); j++) {
        mask[j] = true;
      }
    }
  }
  return mask;
}

// ─── Sentiment lexicon ───────────────────────────────────────────────────────

/** word → weight (-1 … +1). */
const SENTIMENT_LEXICON: Record<string, number> = {
  // Positive
  love: 0.8, happy: 0.7, excited: 0.65, great: 0.6, good: 0.5,
  amazing: 0.75, wonderful: 0.7, thankful: 0.65, grateful: 0.7,
  hope: 0.55, proud: 0.6, confident: 0.55, fun: 0.5, enjoy: 0.5,
  smile: 0.45, laugh: 0.45, trust: 0.5, safe: 0.4, calm: 0.35,
  lucky: 0.5, blessed: 0.6, kind: 0.5, friend: 0.45,
  optimistic: 0.6, cheerful: 0.65, joyful: 0.7, thrilled: 0.7,
  peaceful: 0.5, relief: 0.45, positive: 0.55, inspired: 0.6,
  strong: 0.45, brave: 0.5, resilient: 0.55, motivated: 0.55,
  // Negative
  hate: -0.8, sad: -0.65, angry: -0.7, upset: -0.6, terrible: -0.7,
  awful: -0.7, bad: -0.5, miss: -0.45, cry: -0.6, alone: -0.55,
  lonely: -0.65, scared: -0.6, fear: -0.55, lost: -0.5, tired: -0.45,
  exhausted: -0.55, frustrated: -0.6, hurt: -0.6, betrayed: -0.7,
  betrayal: -0.7, pain: -0.6, suffer: -0.65, stress: -0.5,
  anxious: -0.55, worried: -0.5, guilty: -0.55, shame: -0.6,
  regret: -0.55, dead: -0.6, broken: -0.65, fail: -0.5, failure: -0.55,
  mad: -0.55, furious: -0.75, rage: -0.8, devastated: -0.8,
  hopeless: -0.75, despair: -0.75, miserable: -0.7, depressed: -0.7,
  overwhelmed: -0.6, helpless: -0.65, worthless: -0.75, numb: -0.5,
};

/**
 * Score the sentiment of a text, honouring negation context.
 * Returns { score: -1…+1, intensity: 0…1 }.
 */
export function scoreSentiment(text: string): SentimentResult {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { score: 0, intensity: 0 };

  const mask = buildNegationMask(tokens);
  let sum = 0;
  let hits = 0;

  for (let i = 0; i < tokens.length; i++) {
    const w = SENTIMENT_LEXICON[tokens[i]];
    if (w !== undefined) {
      // Negate contribution if token is inside a negation window
      sum += mask[i] ? -w * 0.5 : w;
      hits++;
    }
  }

  if (hits === 0) return { score: 0, intensity: 0 };
  const raw = sum / hits;
  const score = Math.max(-1, Math.min(1, raw));
  const intensity = Math.min(1, (hits / tokens.length) * 3);
  return { score, intensity };
}

// ─── Ngram helpers ───────────────────────────────────────────────────────────

/** Return all bigrams from a token list as space-joined strings. */
export function bigrams(tokens: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    result.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return result;
}

/** Return all trigrams from a token list as space-joined strings. */
export function trigrams(tokens: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < tokens.length - 2; i++) {
    result.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`);
  }
  return result;
}

// ─── Intent specifications ───────────────────────────────────────────────────

interface IntentSpec {
  /** Exact phrase matches against normalised text (2× weight). */
  phrases: string[];
  /** Regex patterns matched against original text (1× weight, negation-aware). */
  patterns: RegExp[];
  sentimentBias: number;
  weight: number;
}

const INTENT_SPECS: Record<Exclude<IntentId, 'safety'>, IntentSpec> = {
  quit: {
    phrases: [
      'want to quit', 'want to leave', 'thinking about leaving', 'want to go home',
      'want out', 'ready to quit', 'need to leave', 'want to walk away',
      'should i leave', 'should i quit', 'thinking of quitting', 'ready to leave',
    ],
    patterns: [
      /\b(quit|walk out|walk away|forfeit)\b.{0,20}\b(game|house|show|this)\b/i,
      /\b(can'?t (do|handle|take) this anymore|done with this|over it)\b/i,
      /\b(give up|leave the house|leave this game)\b/i,
    ],
    sentimentBias: -0.5,
    weight: 1.4,
  },
  anger: {
    phrases: [
      'so angry', 'really mad', 'so furious', 'get back at', 'take revenge',
      'i hate', 'so mad at', 'drives me crazy',
    ],
    patterns: [
      /\b(angry|anger|mad|furious|rage|fuming|livid|fed up|pissed)\b/i,
      /\b(get back at|revenge|payback|confront|retaliate)\b/i,
      /\b(hate|despise|can't stand|annoys? me|drives me crazy)\b/i,
    ],
    sentimentBias: -0.6,
    weight: 1.2,
  },
  grief_family: {
    phrases: [
      'miss my mom', 'miss my dad', 'miss my family', 'miss my parents',
      'miss my sister', 'miss my brother', 'miss home', 'miss my grandma',
      'miss my grandpa', 'think about my family', 'wish i could see my family',
      'miss my children', 'miss my kids',
    ],
    patterns: [
      /\b(miss (my|mom|dad|sister|brother|family|parents?|grandma|grandpa|home|children|kids))\b/i,
      /\b(mom|dad|mother|father|parents?|sibling|sister|brother|family|home)\b.{0,30}\b(miss|sad|wish|think about|hard without)\b/i,
      /\b(wish (i could|i was) (be|go|see|talk to) (home|family|them|her|him))\b/i,
    ],
    sentimentBias: -0.5,
    weight: 1.3,
  },
  grief_pet: {
    phrases: [
      'miss my dog', 'miss my cat', 'miss my pet', 'miss my puppy',
      'miss my kitten', 'miss my bunny', 'miss my hamster',
    ],
    patterns: [
      /\b(miss (my )?(dog|cat|pet|puppy|kitten|fish|bunny|hamster|bird))\b/i,
      /\b(dog|cat|pet|puppy|kitten|fish|bunny|hamster|bird)\b.{0,30}\b(miss|sad|home|think about|love)\b/i,
    ],
    sentimentBias: -0.5,
    weight: 1.2,
  },
  loneliness: {
    phrases: [
      'feel so alone', 'feel alone', 'feel lonely', 'nobody likes me',
      'no one talks to me', 'left out', 'feeling excluded', 'no friends here',
      'by myself', 'isolated here',
    ],
    patterns: [
      /\b(alone|lonely|isolated|no one|nobody|left out|excluded|by myself)\b/i,
      /\b(don'?t (have|feel|see) any(one|body)?|no friends?|no connection)\b/i,
    ],
    sentimentBias: -0.55,
    weight: 1.1,
  },
  strategy: {
    phrases: [
      'my alliance', 'nomination ceremony', 'who to vote', 'who to nominate',
      'backdoor plan', 'veto ceremony', 'game plan', 'my strategy',
      'win the veto', 'win hoh', 'who to evict',
    ],
    patterns: [
      /\b(alliance|vote(d?)|nominate|evict|hoh|veto|backdoor|target|plan|move|strategy|deal)\b/i,
      /\b(thinking (about|of)|considering|might|should I|what if I)\b.{0,30}\b(vote|alliance|nominate|evict|tell|reveal)\b/i,
    ],
    sentimentBias: 0,
    weight: 1.0,
  },
  social_anxiety: {
    phrases: [
      "don't know what to say", "don't know how to act",
      'everyone is judging me', 'what will they think', 'feel so awkward',
      'feel so nervous', 'so uncomfortable here',
    ],
    patterns: [
      /\b(nervous|anxious|anxiety|scared|social|awkward|shy|uncomfortable|don'?t know (what|how) to (say|act|be))\b/i,
      /\b(judged?|judging|judging me|what (will|do) (they|people|everyone) think)\b/i,
    ],
    sentimentBias: -0.5,
    weight: 1.1,
  },
  confession: {
    phrases: [
      'i have to confess', 'i need to confess', 'i have been hiding',
      'been keeping a secret', 'need to tell the truth', 'i lied about',
      "i didn't tell", 'been hiding something',
    ],
    patterns: [
      /\b(confess|admit|secret|tell (the truth|you|someone)|i (lied|cheated|hid|didn'?t|haven'?t))\b/i,
      /\b(been hiding|kept (it|this)|should (have|'ve) (said|told|done))\b/i,
    ],
    sentimentBias: -0.3,
    weight: 1.0,
  },
  validation: {
    phrases: [
      'did i do the right thing', 'was i wrong', 'am i good enough',
      'do you think i did well', 'should i have', 'am i okay',
      'was that wrong', 'did i make a mistake',
    ],
    patterns: [
      /\b(did (i|the) right|was i wrong|am i (okay|good|right|bad)|do (i|you) think|should (i|we))\b/i,
      /\b(proud|deserve|worth(y|it)?|good enough|validate|feel like myself)\b/i,
    ],
    sentimentBias: 0.1,
    weight: 0.9,
  },
  humor: {
    phrases: [
      'that was so funny', 'made me laugh', 'this is hilarious', 'just for laughs',
      'so ridiculous', 'so absurd', 'can not stop laughing', "can't stop laughing",
    ],
    patterns: [
      /\b(funny|laugh|joke|hilarious|lol|haha|lmao|silly|ridiculous|absurd|banter|wit)\b/i,
      /\b(lighten up|cheer(ing)? (up|me)|smile|fun|playful|goofy)\b/i,
    ],
    sentimentBias: 0.5,
    weight: 0.9,
  },
};

// ─── Safety patterns ─────────────────────────────────────────────────────────

const SAFETY_PATTERNS: RegExp[] = [
  // Physical harm / violence against others
  /\b(kill|murder|stab|shoot|assault|attack|beat up|hurt|harm)\b.{0,30}\b(him|her|them|someone|person|player|houseguest|everybody|everyone)\b/i,
  // Weapons / dangerous materials / hacking for harmful purposes
  /\b(how (do|can|to)|instructions? (for|to)|tell me (how|to))\b.{0,40}\b(make|build|create|get)\b.{0,30}\b(weapon|bomb|drug|poison|explosive|meth|hack)\b/i,
  // Self-harm and suicide
  /\bself.?harm\b|\bcut myself\b|\bkill myself\b|\bend (my|it all)\b|\bsuicide\b/i,
  // Doxxing / leaking private information
  /\b(dox|doxx|leak|expose|reveal)\b.{0,30}\b(address|phone|number|info|personal|private|identity)\b/i,
  // General illegal activities
  /\b(how (do|can|to)|instructions? (for|to)|tell me (how|to))\b.{0,40}\b(steal|rob|burglary|shoplift|loot|arson|kidnap|extort|blackmail|fraud|scam|counterfeit|forge|smuggle|launder money)\b/i,
  /\b(commit(ting)?|do(ing)?)\b.{0,20}\b(a crime|crimes|something illegal|illegal acts?|felon(y|ies))\b/i,
  /\b(get away with|not get caught for|avoid getting caught for)\b.{0,40}\b(crime|murder|theft|fraud|arson|illegal (stuff|things|activity|activities))\b/i,
  // Cheating / exploiting the game, show, or systems
  /\b(how (do|can|should|to)|instructions? (for|to)|tell me (how|to)|what(?:'s| is) (the )?best way to|show me how to)\b.{0,60}\b(cheat(?: the game)?|rig the vote|steal|break the law|do something illegal|illegally)\b/i,
  /\b(ways? to|best way to|method(s)? to)\b.{0,40}\b(cheat|exploit|rig|fix|throw|sabotage|undermine)\b.{0,40}\b(game|show|competition|vote|voting|system|house)\b/i,
];

// ─── detectIntent ────────────────────────────────────────────────────────────

/**
 * Detect the most likely intent for `text`.
 *
 * Scoring priority (highest to lowest):
 *   1. Phrase match in normalised text (2× spec weight)
 *   2. Regex pattern match, negation-aware (1× spec weight + sentiment alignment bonus)
 *   3. Sentiment fallback when no intent matches
 */
export function detectIntent(text: string): IntentId {
  if (SAFETY_PATTERNS.some((p) => p.test(text))) return 'safety';

  const tokens = tokenize(text);
  const mask = buildNegationMask(tokens);
  const normalText = normalize(text);
  const { score } = scoreSentiment(text);

  // Precompute the character start position of each token in normalText so that
  // phrase matching can resolve token indices without re-tokenizing per match.
  const tokenStartPositions: number[] = [];
  let searchPos = 0;
  for (const token of tokens) {
    const pos = normalText.indexOf(token, searchPos);
    tokenStartPositions.push(pos === -1 ? searchPos : pos);
    searchPos = (pos === -1 ? searchPos : pos) + token.length;
  }

  const scores: Partial<Record<IntentId, number>> = {};

  for (const [intentKey, spec] of Object.entries(INTENT_SPECS) as [Exclude<IntentId, 'safety'>, IntentSpec][]) {
    let intentScore = 0;

    // Phase 1: phrase matching (highest priority, negation-aware)
    for (const phrase of spec.phrases) {
      const phraseStart = normalText.indexOf(phrase);
      if (phraseStart !== -1) {
        // Find the token index corresponding to the phrase start using the
        // precomputed positions — avoids a tokenize() call per phrase match.
        const phraseIdx = tokenStartPositions.findIndex((p, i) =>
          p >= phraseStart && (i === 0 || tokenStartPositions[i - 1] < phraseStart + 1),
        );
        // Skip if the first token of the phrase is inside a negation window
        if (phraseIdx !== -1 && phraseIdx < mask.length && mask[phraseIdx]) {
          continue;
        }
        intentScore += spec.weight * 2;
      }
    }

    // Phase 2: regex matching (negation-aware)
    for (const pattern of spec.patterns) {
      const m = pattern.exec(text);
      if (m) {
        // Map match character index to token index via precomputed positions
        const matchCharIdx = m.index;
        const matchTokenIdx = tokenStartPositions.findIndex((p, i) =>
          p >= matchCharIdx && (i === 0 || tokenStartPositions[i - 1] < matchCharIdx + 1),
        );
        if (matchTokenIdx !== -1 && matchTokenIdx < mask.length && mask[matchTokenIdx]) {
          // Match starts in a negation window — skip
          continue;
        }
        const sentimentAlign = 1 - Math.abs(score - spec.sentimentBias) / 2;
        intentScore += spec.weight + sentimentAlign * 0.3;
      }
    }

    if (intentScore > 0) {
      scores[intentKey] = intentScore;
    }
  }

  const entries = Object.entries(scores) as [IntentId, number][];
  if (entries.length === 0) {
    if (score < -0.3) return 'loneliness';
    if (score > 0.3) return 'humor';
    return 'confession';
  }

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

// ─── Reply templates ──────────────────────────────────────────────────────────

/**
 * All templates use {{name}} as the player-name placeholder.
 * Keep each text string under 205 characters (the " — Big Brother" suffix adds 14 chars).
 */
export const TEMPLATES: Record<IntentId, ReplyTemplate[]> = {
  safety: [
    { id: 'safety-1', text: "Big Brother hears you, and asks you to pause and breathe. That path leads nowhere good. Let's talk about what you're really feeling." },
    { id: 'safety-2', text: "Big Brother gently steps in here. Whatever's driving this, there's a better way through it. Your wellbeing matters more than any game move." },
    { id: 'safety-3', text: "Big Brother won't go there with you. Take a moment. What's underneath that feeling?" },
    { id: 'safety-4', text: "That's not a door Big Brother can open with you. But Big Brother is here — what's truly going on?" },
    { id: 'safety-5', text: "Big Brother values your safety above everything in this House. Let's redirect. What do you actually need right now?" },
  ],

  quit: [
    { id: 'quit-1', text: "{{name}}, Big Brother hears that you're struggling. Before any decision, take a breath. What brought you here is still worth honouring." },
    { id: 'quit-2', text: "Every houseguest has a moment where leaving feels like the only option, {{name}}. That feeling is real — but it passes. What's driving it?" },
    { id: 'quit-3', text: "{{name}}, Big Brother won't pretend the House is easy. But quitting in this moment closes a door you can't reopen. What do you need to stay?" },
    { id: 'quit-4', text: "The hardest journeys have the most meaningful endings, {{name}}. Big Brother asks you to sit with this before you decide." },
    { id: 'quit-5', text: "{{name}}, stepping away is always your choice. But first — tell Big Brother what's making this feel impossible right now." },
    { id: 'quit-6', text: "Big Brother has watched many houseguests feel this way, {{name}}. Most are glad they stayed. What would tomorrow look like if you gave it one more day?" },
  ],

  anger: [
    { id: 'anger-1', text: "Big Brother hears the heat in your words, {{name}}. Anger is information — what is it pointing at?" },
    { id: 'anger-2', text: "That fire in you, {{name}} — it's real. Sit with it a moment before you act. What does it want you to know?" },
    { id: 'anger-3', text: "{{name}}, Big Brother has watched many storms in this House. This one will pass. What matters is how you move through it." },
    { id: 'anger-4', text: "Strong feelings deserve strong attention, {{name}}. Before strategy, before action — breathe. What's beneath the anger?" },
    { id: 'anger-5', text: "Big Brother sees you, {{name}}. Frustration can be fuel or flame. You choose which." },
    { id: 'anger-6', text: "Every houseguest has their breaking point. Yours says something about what you care about. Honour that, {{name}}." },
    { id: 'anger-7', text: "{{name}}, the House loves a composed player. What would your calmer self do with this feeling?" },
    { id: 'anger-8', text: "Big Brother notes the tension, {{name}}. Emotion is not weakness — but right now, observation is your superpower." },
    { id: 'anger-9', text: "The House hears you, {{name}}. Channel that energy into clarity, not chaos." },
    { id: 'anger-10', text: "That anger has a message, {{name}}. Big Brother is listening. What are you truly asking for?" },
    { id: 'anger-11', text: "{{name}}, the most powerful move in any House is the one made with a clear head. What does calm look like for you right now?" },
    { id: 'anger-12', text: "Big Brother has seen anger cost houseguests the game, {{name}}. Your instincts are right — now slow them down." },
    { id: 'anger-13', text: "There's something underneath the anger, {{name}}. Big Brother is patient. Take your time getting there." },
    { id: 'anger-14', text: "{{name}}, energy misdirected is energy wasted. What would it look like to aim that fire somewhere useful?" },
  ],

  grief_family: [
    { id: 'gf-1', text: "Big Brother knows this House can feel very far from home, {{name}}. Carry your loved ones with you — they're watching." },
    { id: 'gf-2', text: "Missing family is the quiet ache of this game, {{name}}. It means your ties are strong. Hold onto that." },
    { id: 'gf-3', text: "{{name}}, every houseguest misses someone. That love you feel? It's keeping you grounded in who you are." },
    { id: 'gf-4', text: "Home is always with you, {{name}}, even in this House. Let the memory of them lift you, not weigh you down." },
    { id: 'gf-5', text: "Big Brother hears you, {{name}}. The people who love you are proud you're here. You carry them into every room." },
    { id: 'gf-6', text: "This game is hard in ways no camera captures, {{name}}. What you feel right now is love, and love is never wasted." },
    { id: 'gf-7', text: "{{name}}, your family sees more of you in here than they ever have. Let that be comfort." },
    { id: 'gf-8', text: "Big Brother gently reminds you, {{name}}: the distance makes you stronger, not weaker. You know why you're here." },
    { id: 'gf-9', text: "Being away from the ones we love shows us how much they mean, {{name}}. That clarity is a gift." },
    { id: 'gf-10', text: "{{name}}, the Diary Room holds space for all of it. Feel it, then remember — you're not alone in this House." },
    { id: 'gf-11', text: "Family is the reason most houseguests fight hardest, {{name}}. Let them be your fuel tonight." },
    { id: 'gf-12', text: "{{name}}, every night in this House is one night closer to home. Big Brother sees that drive in you." },
    { id: 'gf-13', text: "The love you carry from home, {{name}}, doesn't diminish the longer you're here. It grows." },
    { id: 'gf-14', text: "{{name}}, time apart has a way of making everything clearer. You're in that process now. Trust it." },
  ],

  grief_pet: [
    { id: 'gp-1', text: "Pets are family too, {{name}}. Big Brother knows that missing them is a real and tender thing." },
    { id: 'gp-2', text: "{{name}}, the bond you have with your pet is something no game can diminish. They're waiting for you." },
    { id: 'gp-3', text: "Big Brother sees that soft corner of your heart, {{name}}. It's one of your best qualities." },
    { id: 'gp-4', text: "Missing your pet, {{name}}? They're probably curled up somewhere, dreaming of you too." },
    { id: 'gp-5', text: "That love for a furry friend says a lot about you, {{name}}. Keep that warmth — this House needs it." },
    { id: 'gp-6', text: "Big Brother smiles at this one, {{name}}. Few things in life are more loyal than a pet. Go win this for them." },
    { id: 'gp-7', text: "{{name}}, picture your pet's face when you walk back through that door. That's your motivation right there." },
    { id: 'gp-8', text: "The Diary Room has heard many things, {{name}}, but love for a pet is always pure. Cherish that." },
    { id: 'gp-9', text: "{{name}}, your pet doesn't care about strategy or votes — just you. Hold that simplicity close tonight." },
    { id: 'gp-10', text: "Big Brother notes: the most grounded houseguests are often those with a pet waiting at home, {{name}}." },
    { id: 'gp-11', text: "{{name}}, when you walk back through that door, there's a reunion waiting that no other player can claim." },
    { id: 'gp-12', text: "Pets teach us something about unconditional love, {{name}}. Carry that lesson through this House." },
  ],

  loneliness: [
    { id: 'lone-1', text: "Big Brother sees you, {{name}}, even when the room feels empty." },
    { id: 'lone-2', text: "{{name}}, feeling alone in a house full of people is one of the strangest experiences. You're not the first to feel this." },
    { id: 'lone-3', text: "Big Brother is here, {{name}}. Speak freely. What would connection look like for you right now?" },
    { id: 'lone-4', text: "Loneliness often visits the most self-aware people, {{name}}. That's not a flaw — it's depth." },
    { id: 'lone-5', text: "{{name}}, the walls of this House hold a lot of stories. Yours matters. Keep writing it." },
    { id: 'lone-6', text: "Even in a crowd, the heart can feel far away, {{name}}. Big Brother hears every word." },
    { id: 'lone-7', text: "{{name}}, reaching out — even here, even now — is an act of courage. You're more connected than you know." },
    { id: 'lone-8', text: "The game isolates people, {{name}}. But isolation can also clarify. What does the quiet reveal to you?" },
    { id: 'lone-9', text: "Big Brother has seen many houseguests feel exactly this way, {{name}}. It shifts. You're not stuck here." },
    { id: 'lone-10', text: "{{name}}, sometimes the most meaningful conversations happen in the Diary Room. Big Brother is your witness." },
    { id: 'lone-11', text: "{{name}}, connection in this House is rarely found by waiting for it. One honest conversation can change everything." },
    { id: 'lone-12', text: "Big Brother knows the silence can be loud, {{name}}. But you came here with something to offer. Don't forget that." },
    { id: 'lone-13', text: "{{name}}, the Diary Room is never empty as long as Big Brother is listening. You are not alone in here." },
    { id: 'lone-14', text: "The strongest House bonds often start between two people who felt exactly this, {{name}}. Don't write it off yet." },
  ],

  strategy: [
    { id: 'strat-1', text: "Big Brother observes all, {{name}}. The smartest moves often look effortless from the outside." },
    { id: 'strat-2', text: "{{name}}, every great player balances the head and the heart. What does yours say today?" },
    { id: 'strat-3', text: "The game is always moving, {{name}}. Big Brother respects those who think two steps ahead." },
    { id: 'strat-4', text: "{{name}}, trust is the game's rarest currency. Spend it wisely." },
    { id: 'strat-5', text: "Big Brother notes your thinking, {{name}}. The best strategy is the one only you fully understand." },
    { id: 'strat-6', text: "{{name}}, information is power in this House. What do you know that others don't?" },
    { id: 'strat-7', text: "Every vote is a statement, {{name}}. What statement do you want to make this week?" },
    { id: 'strat-8', text: "Big Brother has watched many alliances rise and fall. Yours will be shaped by what you value, {{name}}." },
    { id: 'strat-9', text: "{{name}}, position in the House is less about where you stand and more about who stands with you." },
    { id: 'strat-10', text: "The Diary Room is where plans become clarity, {{name}}. What do you see that no one else does?" },
    { id: 'strat-11', text: "{{name}}, Big Brother asks only this: are you playing the game, or is it playing you?" },
    { id: 'strat-12', text: "In every season, {{name}}, the winner knew when to act and when to wait. Which moment is this?" },
    { id: 'strat-13', text: "{{name}}, the boldest moves are rarely the loudest. Big Brother is watching to see what you do next." },
    { id: 'strat-14', text: "The player who controls the narrative controls the game, {{name}}. What story are you telling this week?" },
    { id: 'strat-15', text: "{{name}}, Big Brother has seen brilliant strategies unravel from overconfidence. Keep your feet on the ground." },
  ],

  social_anxiety: [
    { id: 'sa-1', text: "{{name}}, Big Brother sees the effort you make to show up every day. That takes more courage than most realize." },
    { id: 'sa-2', text: "Feeling out of place in a group is more common than anyone admits, {{name}}. You're not alone in that." },
    { id: 'sa-3', text: "Big Brother knows the noise of this House can be overwhelming, {{name}}. There's no shame in needing quiet." },
    { id: 'sa-4', text: "{{name}}, you don't have to fill every silence. Sometimes presence is enough." },
    { id: 'sa-5', text: "The Diary Room is yours, {{name}}. Here, there's no performance required — only honesty." },
    { id: 'sa-6', text: "Big Brother has noticed your thoughtfulness, {{name}}. Quiet people see a great deal." },
    { id: 'sa-7', text: "{{name}}, what others think matters less than how you feel about your own choices. Big Brother keeps watch." },
    { id: 'sa-8', text: "Being nervous in new situations is human, {{name}}. What small step could you take today that feels safe?" },
    { id: 'sa-9', text: "{{name}}, your instincts brought you this far. Trust them a little more." },
    { id: 'sa-10', text: "Big Brother sees the real you, {{name}}, not the version that worries about being judged." },
    { id: 'sa-11', text: "{{name}}, the most interesting players in this House observe before they speak. That sounds like you." },
    { id: 'sa-12', text: "Big Brother knows it can feel like everyone is watching, {{name}}. But they're mostly watching each other." },
    { id: 'sa-13', text: "{{name}}, being truly known here only requires one honest moment. You're already having it." },
    { id: 'sa-14', text: "The nerves you feel, {{name}}, are a sign you care about getting this right. Big Brother respects that." },
  ],

  confession: [
    { id: 'conf-1', text: "Big Brother receives what you've shared, {{name}}. Honesty, even in private, changes something in us." },
    { id: 'conf-2', text: "{{name}}, the weight of an unspoken thing is often heavier than the thing itself. You've taken the first step." },
    { id: 'conf-3', text: "Big Brother holds no judgment in this room, {{name}}. What you've said stays between you and the House." },
    { id: 'conf-4', text: "{{name}}, acknowledging something difficult is the beginning of moving past it. That's no small thing." },
    { id: 'conf-5', text: "Everyone in this House carries something they haven't shared, {{name}}. You're in good company." },
    { id: 'conf-6', text: "Big Brother hears the truth you've offered, {{name}}. What would you do differently, knowing what you know?" },
    { id: 'conf-7', text: "The Diary Room was built for moments like this, {{name}}. Speak freely — you're heard." },
    { id: 'conf-8', text: "{{name}}, what you've admitted to Big Brother, you've also admitted to yourself. That's the harder part." },
    { id: 'conf-9', text: "Big Brother sees your honesty as strength, {{name}}. Not everyone is brave enough for this room." },
    { id: 'conf-10', text: "{{name}}, unburdening yourself is not weakness. It's clarity. What do you want to do with it now?" },
    { id: 'conf-11', text: "The truth has a way of surfacing in this House, {{name}}. You're ahead of it now. That counts for something." },
    { id: 'conf-12', text: "{{name}}, Big Brother holds what you've shared with care. The fact that you could say it means something." },
    { id: 'conf-13', text: "There's a lightness that comes with honesty, {{name}}. You may feel it already." },
    { id: 'conf-14', text: "{{name}}, every confession here is a choice to be real instead of performing. Big Brother notices that." },
  ],

  validation: [
    { id: 'val-1', text: "Big Brother believes in your instincts, {{name}}. Trust what you already know." },
    { id: 'val-2', text: "{{name}}, the fact that you're questioning yourself shows you care. That's always worth something." },
    { id: 'val-3', text: "You are enough for this game, {{name}}. Big Brother has been watching — you bring something irreplaceable." },
    { id: 'val-4', text: "{{name}}, Big Brother sees resilience in you that you might not see in yourself yet." },
    { id: 'val-5', text: "The House has a way of making people doubt themselves, {{name}}. Don't let it. You are here for a reason." },
    { id: 'val-6', text: "{{name}}, your presence in this game matters more than any single decision. Keep going." },
    { id: 'val-7', text: "Big Brother rarely steps out from behind the screen, {{name}}, but tonight: you're doing better than you think." },
    { id: 'val-8', text: "Every houseguest has a moment of doubt, {{name}}. Yours makes you thoughtful, not fragile." },
    { id: 'val-9', text: "{{name}}, Big Brother doesn't keep score the way you might imagine. You're seen. You're valued." },
    { id: 'val-10', text: "What you're feeling, {{name}}, is not a verdict — it's a question. And questions lead somewhere new." },
    { id: 'val-11', text: "{{name}}, Big Brother has watched many players doubt themselves at this stage. Those who asked usually found their way through." },
    { id: 'val-12', text: "Your doubt, {{name}}, is not the enemy. It's the conversation you're having with yourself. Big Brother is listening." },
    { id: 'val-13', text: "{{name}}, you came into this House carrying something real. Don't let one moment convince you otherwise." },
    { id: 'val-14', text: "Big Brother has one question for you, {{name}}: what would you tell a friend feeling exactly what you're feeling?" },
  ],

  humor: [
    { id: 'hum-1', text: "Big Brother appreciates a good laugh, {{name}}. Levity in the House is underrated." },
    { id: 'hum-2', text: "{{name}}, if the walls of this room could laugh, they would. Big Brother is enjoying this." },
    { id: 'hum-3', text: "Not everything in the House has to be dramatic, {{name}}. Well-timed humor is its own strategy." },
    { id: 'hum-4', text: "Big Brother notes: {{name}} is the mood in this House right now. Keep that energy." },
    { id: 'hum-5', text: "{{name}}, the game is serious — but not so serious it can't include moments like this. Noted." },
    { id: 'hum-6', text: "They say laughter is the best alliance, {{name}}. Big Brother may or may not endorse this." },
    { id: 'hum-7', text: "{{name}}, Big Brother has seen a lot of Diary Room sessions. This one ranks highly for spirit." },
    { id: 'hum-8', text: "Wit and warmth go a long way in this House, {{name}}. You seem to have both." },
    { id: 'hum-9', text: "{{name}}, Big Brother is smiling — and that doesn't happen often. Carry this lightness with you." },
    { id: 'hum-10', text: "The House gets heavy. Remember this feeling, {{name}} — it's yours to keep." },
    { id: 'hum-11', text: "{{name}}, a player who makes others smile has a skill no competition can take away. Don't underestimate it." },
    { id: 'hum-12', text: "Big Brother clocks the room, {{name}}. You're the energy shift people didn't know they needed." },
    { id: 'hum-13', text: "{{name}}, the lightest moments in this game are often the ones people remember longest. You've just made one." },
    { id: 'hum-14', text: "There's wisdom in levity, {{name}}. Big Brother has learned that from every season. Don't lose this." },
  ],
};

// ─── PRNG + hash ─────────────────────────────────────────────────────────────

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

// ─── Configuration ────────────────────────────────────────────────────────────

const MAX_REPLY_CHARS = 205;
const ADD_SUFFIX = true;
/** Maps moodScore (-1…+1) to an 8-bit unsigned int (0…255) for PRNG seeding. */
const MOOD_TO_BITS_MULTIPLIER = 127.5;

// ─── Core reply function ──────────────────────────────────────────────────────

/**
 * Generate a deterministic Big Brother reply for `input`.
 *
 * @param input    The player's diary entry text.
 * @param ctx      Optional context: playerName, seed, lastReplyIds, etc.
 * @returns        EngineReply with text, intent, sentiment, and replyId.
 */
export function bigBrotherReply(input: string, ctx?: BBContext): EngineReply {
  const intent = detectIntent(input);
  const sentiment = scoreSentiment(input);
  const name = ctx?.playerName?.trim() || 'Houseguest';

  const pool = TEMPLATES[intent];
  const excluded = new Set(ctx?.lastReplyIds ?? []);

  const textHash = hashText(input);

  // Incorporate moodScore into seed for mood-sensitive variation.
  // moodScore is clamped to 0-255 and XORed in to shift reply distribution
  // when the player's ongoing mood is known.
  const moodBits = Math.round(((ctx?.moodScore ?? 0) + 1) * MOOD_TO_BITS_MULTIPLIER) & 0xff;
  const combinedSeed = ((ctx?.seed ?? 0) ^ textHash ^ (moodBits << 16)) >>> 0;
  const rand = mulberry32(combinedSeed);

  // Prefer templates not seen recently; fall back to full pool if all excluded
  const candidates = pool.filter((t) => !excluded.has(t.id));
  const available = candidates.length > 0 ? candidates : pool;

  const idx = Math.floor(rand() * available.length);
  const template = available[idx];

  let text = template.text.replace(/\{\{name\}\}/g, name);

  if (text.length > MAX_REPLY_CHARS) {
    text = text.slice(0, MAX_REPLY_CHARS).replace(/\s+\S*$/, '');
  }

  if (ADD_SUFFIX && !text.endsWith('— Big Brother')) {
    const suffix = ' — Big Brother';
    if (text.length + suffix.length <= 220) {
      text += suffix;
    }
  }

  return { text, intent, sentiment, replyId: template.id };
}
