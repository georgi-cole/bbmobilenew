import { getById, findByName } from '../../data/houseguests';
import { mulberry32 } from '../../store/rng';
import type { Player } from '../../types';

type GoodbyeSegment = 'opening' | 'reflection' | 'emotion' | 'shoutout' | 'closure';

export type GoodbyePersonality =
  | 'strategist'
  | 'emotional'
  | 'cocky'
  | 'quiet'
  | 'chaotic'
  | 'loyal';

export interface FinalGoodbyeMessage {
  player: Player;
  personality: GoodbyePersonality;
  segmentTypes: GoodbyeSegment[];
  segments: string[];
  text: string;
}

const SEGMENT_ORDER: readonly GoodbyeSegment[] = [
  'opening',
  'reflection',
  'emotion',
  'shoutout',
  'closure',
];

const PERSONALITY_ROTATION: readonly GoodbyePersonality[] = [
  'strategist',
  'emotional',
  'cocky',
  'quiet',
  'chaotic',
  'loyal',
];

const BASE_SEGMENTS: Record<Exclude<GoodbyeSegment, 'shoutout'>, readonly string[]> = {
  opening: [
    'Damn.',
    'Well… here we are.',
    'What a journey.',
    'I did not expect this ending.',
    'Crazy ride.',
    'Not gonna lie—this was intense.',
    'From day one to now…',
    'House lights are getting real low.',
    'That finale hit fast.',
    'No one glides out of this place untouched.',
  ],
  reflection: [
    'This house changes you.',
    'Nothing about this was easy.',
    'Every move mattered.',
    'This game is brutal.',
    'You think you are ready—but you are not.',
    'I learned more than I expected.',
    'Every week rewrote the story.',
    'One bad read can flip everything.',
    'Pressure tells the truth in here.',
    'This place makes every choice loud.',
  ],
  emotion: [
    'I am proud of how I played.',
    'No regrets.',
    'I gave it everything.',
    'Some things I would change—but that is the game.',
    'This meant more to me than you know.',
    'It hit harder than I thought.',
    'I am leaving full-hearted.',
    'That was bigger than a TV moment for me.',
    'I felt every high and every hit.',
    'I can live with the way I showed up.',
  ],
  closure: [
    'Good luck out there.',
    'Play hard till the end.',
    'Finish what we started.',
    'Lights out.',
    'See you on finale night.',
    'Make it count.',
    'Do not waste the shot in front of you.',
    'Take this all the way home.',
    'Keep your heads clear.',
    'Leave nothing on the table.',
  ],
};

const PERSONALITY_SEGMENTS: Record<
  GoodbyePersonality,
  Partial<Record<Exclude<GoodbyeSegment, 'shoutout'>, readonly string[]>>
> = {
  strategist: {
    reflection: [
      'Timing is everything in this game.',
      'The smallest decision can change the board.',
      'You win this by reading the room before it reads you.',
      'Moves matter more than speeches at the end.',
      'Half this game is patience, the other half is timing.',
      'One vote can punish a month of bad decisions.',
    ],
    emotion: [
      'I can stand on every decision I made.',
      'I played the angles I had.',
      'No panic, no apology—just the game.',
    ],
    closure: [
      'Trust your read and take the shot.',
      'Count the votes before you make the move.',
      'Think two moves ahead.',
    ],
  },
  emotional: {
    opening: [
      'Wow… okay.',
      'This is a lot to feel at once.',
      'I am still trying to take this in.',
    ],
    reflection: [
      'This house got under my skin.',
      'The emotional part was harder than the strategy.',
      'You carry every goodbye with you in here.',
    ],
    emotion: [
      'My heart was in this the whole time.',
      'I cared maybe too much—and I am okay with that.',
      'This cracked me open in ways I did not expect.',
      'I am grateful, wrecked, and weirdly proud all at once.',
    ],
    closure: [
      'Be kind to each other when this gets ugly.',
      'Hold on to the people who were real with you.',
      'Take care of each other in there.',
    ],
  },
  cocky: {
    opening: [
      'Yeah, I know.',
      'Well, that was loud.',
      'You felt me in this game.',
    ],
    reflection: [
      'They are still going to talk about my game.',
      'I did not come in here to play small.',
      'I took swings, and everybody felt them.',
    ],
    emotion: [
      'You should have taken me out earlier.',
      'I left my mark, period.',
      'Say what you want—I was never background.',
    ],
    closure: [
      'Try to keep up.',
      'Do not get boring without me.',
      'Somebody better finish strong.',
    ],
  },
  quiet: {
    opening: [
      'Well.',
      'So… yeah.',
      'That is that.',
    ],
    reflection: [
      'A lot happened.',
      'This game says enough on its own.',
      'I saw more than I said.',
      'Silence can still carry weight.',
    ],
    emotion: [
      'It mattered to me.',
      'I am at peace with it.',
      'No big speech from me.',
    ],
    closure: [
      'Be smart.',
      'Finish it.',
      'Goodnight.',
    ],
  },
  chaotic: {
    opening: [
      'Well, that was unhinged.',
      'Honestly? What even was that.',
      'I survived the weirdest roller coaster alive.',
    ],
    reflection: [
      'This game is one long plot twist with snacks.',
      'Every day in here felt like a dare.',
      'I came for an experience and got struck by lightning instead.',
    ],
    emotion: [
      'I laughed, spiraled, recovered, repeated.',
      'I had fun right next to the stress attack.',
      'If I cried, no I did not.',
    ],
    closure: [
      'Keep the chaos warm for me.',
      'Somebody do something iconic.',
      'Try not to make the finale boring.',
    ],
  },
  loyal: {
    opening: [
      'Man, this one is real.',
      'Hard to walk out on people you care about.',
      'This goodbye hits different.',
    ],
    reflection: [
      'The relationships were the whole thing for me.',
      'Trust was worth more than any comp win.',
      'The people mattered more than the noise.',
    ],
    emotion: [
      'I am proud of the people I stood beside.',
      'I played with heart and I would do that again.',
      'The bonds were the part I will carry out with me.',
    ],
    closure: [
      'Hold it down for each other.',
      'Keep the people you trust close.',
      'Take care of the ones who took care of you.',
    ],
  },
};

const SEGMENT_WEIGHTS: Record<GoodbyePersonality, Record<GoodbyeSegment, number>> = {
  strategist: { opening: 2, reflection: 6, emotion: 1, shoutout: 1, closure: 3 },
  emotional: { opening: 2, reflection: 2, emotion: 6, shoutout: 1, closure: 3 },
  cocky: { opening: 2, reflection: 4, emotion: 5, shoutout: 0.5, closure: 1 },
  quiet: { opening: 1, reflection: 4, emotion: 3, shoutout: 0.25, closure: 2 },
  chaotic: { opening: 4, reflection: 2, emotion: 3, shoutout: 2, closure: 3 },
  loyal: { opening: 2, reflection: 2, emotion: 3, shoutout: 6, closure: 4 },
};

const SHOUTOUT_TEMPLATES: Record<GoodbyePersonality, readonly ((name: string) => string)[]> = {
  strategist: [
    name => `${name}, respect.`,
    name => `${name}, you kept me honest in here.`,
    name => `Credit where it is due—${name} came to play.`,
  ],
  emotional: [
    name => `Love to ${name}.`,
    name => `${name}, you know what you meant to me.`,
    name => `${name}, thank you for making this feel human.`,
  ],
  cocky: [
    name => `${name}, no hard feelings.`,
    name => `${name}, you know we made good TV.`,
    name => `${name}, respect the smoke.`,
  ],
  quiet: [
    name => `${name}, respect.`,
    name => `${name}, you know.`,
    name => `Appreciate you, ${name}.`,
  ],
  chaotic: [
    name => `${name}, stay messy for me.`,
    name => `${name}, thanks for surviving that madness with me.`,
    name => `${name}, never let them call us boring.`,
  ],
  loyal: [
    name => `Much love to ${name}.`,
    name => `${name}, I have got love for you always.`,
    name => `${name}, thanks for making this worth it.`,
    name => `${name}, you were real with me and I will not forget it.`,
  ],
};

const FALLBACK_LINES = [
  'No regrets. That was real.',
  'It was a lot, and I am good with how I went through it.',
  'This house takes something out of you, but it gives something back too.',
  'I left a piece of myself in this game.',
  'That is my goodbye, and I mean it.',
] as const;

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(31, hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function pickWeighted<T>(rng: () => number, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function shuffle<T>(rng: () => number, values: readonly T[]): T[] {
  const pool = [...values];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function pickUniqueText(
  rng: () => number,
  pool: readonly string[],
  usedPhrases: Set<string>,
): string {
  const unused = pool.filter((text) => !usedPhrases.has(text));
  const source = unused.length > 0 ? unused : pool;
  const text = source[Math.floor(rng() * source.length)];
  usedPhrases.add(text);
  return text;
}

function inferFromProfile(player: Player): GoodbyePersonality | null {
  const profile = getById(player.id) ?? findByName(player.name);
  const text = `${profile?.profession ?? ''} ${profile?.story ?? ''}`.toLowerCase();

  if (/(chess|strateg|data|architect|engineer|operations|algorithm|planner|system|analytical|timing)/.test(text)) {
    return 'strategist';
  }
  if (/(music|violin|poet|heart|feel|emotion|melod|soul|artist|vulnerab)/.test(text)) {
    return 'emotional';
  }
  if (/(community|collaboration|harmony|team|peace|trust|family|together|loyal|care)/.test(text)) {
    return 'loyal';
  }
  if (/(ruthless|powerhouse|fight|fighter|champion|confidence|black belt|standards)/.test(text)) {
    return 'cocky';
  }
  if (/(shy|quiet|reserved|anxiety|minimal|agreeable|invisible|silence)/.test(text)) {
    return 'quiet';
  }
  if (/(chaos|wild|unpredict|spotlight|rebel|roller coaster|iconic|perform)/.test(text)) {
    return 'chaotic';
  }
  return null;
}

export function inferGoodbyePersonality(player: Player): GoodbyePersonality {
  const inferred = inferFromProfile(player);
  if (inferred) return inferred;

  const profile = getById(player.id) ?? findByName(player.name);
  const competition = player.competitionProfile ?? profile?.competitionProfile;
  if (competition) {
    if (competition.mental >= 80 || competition.consistency >= 80) return 'strategist';
    if (competition.nerve >= 80 && competition.clutch >= 70) return 'cocky';
    if (competition.luck >= 70) return 'chaotic';
    if (competition.precision >= 80 && competition.chokeRisk >= 35) return 'quiet';
  }

  const hash = stableHash(`${player.id}:${player.name}`);
  return PERSONALITY_ROTATION[hash % PERSONALITY_ROTATION.length];
}

function pickSegmentCount(personality: GoodbyePersonality, rng: () => number): 1 | 2 | 3 {
  switch (personality) {
    case 'quiet':
      return rng() < 0.55 ? 1 : 2;
    case 'cocky':
      return pickWeighted(rng, [[1, 4], [2, 4], [3, 1]]) as 1 | 2 | 3;
    case 'strategist':
      return pickWeighted(rng, [[1, 1], [2, 4], [3, 3]]) as 1 | 2 | 3;
    case 'emotional':
      return pickWeighted(rng, [[1, 1], [2, 3], [3, 4]]) as 1 | 2 | 3;
    case 'chaotic':
      return pickWeighted(rng, [[1, 1], [2, 3], [3, 5]]) as 1 | 2 | 3;
    case 'loyal':
      return pickWeighted(rng, [[1, 1], [2, 2], [3, 5]]) as 1 | 2 | 3;
    default:
      return 2;
  }
}

function chooseSegmentTypes(
  personality: GoodbyePersonality,
  count: number,
  peers: Player[],
  rng: () => number,
): GoodbyeSegment[] {
  const types = new Set<GoodbyeSegment>();
  if (personality === 'strategist') types.add('reflection');
  if (personality === 'emotional') types.add('emotion');
  if (personality === 'loyal' && peers.length > 0 && count > 1) types.add('shoutout');
  if (personality === 'quiet' && count === 1 && rng() < 0.65) types.add('closure');
  if (personality === 'chaotic' && count === 3 && rng() < 0.7) types.add('opening');
  if (personality === 'cocky' && count > 1 && rng() < 0.8) types.add('emotion');

  const candidates = SEGMENT_ORDER.filter((type) => (
    !types.has(type) &&
    (type !== 'shoutout' || peers.length > 0) &&
    !(personality === 'quiet' && type === 'opening' && count === 1)
  ));

  while (types.size < count && candidates.length > 0) {
    const remaining = candidates
      .filter((type) => !types.has(type))
      .map((type) => [type, SEGMENT_WEIGHTS[personality][type]] as const);
    types.add(pickWeighted(rng, remaining));
  }

  const ordered = SEGMENT_ORDER.filter((type) => types.has(type));
  return personality === 'chaotic' ? shuffle(rng, ordered) : ordered;
}

function buildShoutoutSegment(
  personality: GoodbyePersonality,
  player: Player,
  peers: Player[],
  rng: () => number,
  usedPhrases: Set<string>,
  usedShoutouts: Set<string>,
): string {
  const availablePeers = peers.filter((peer) => peer.id !== player.id);
  const unusedTargets = availablePeers.filter((peer) => !usedShoutouts.has(peer.id));
  const targetPool = unusedTargets.length > 0 ? unusedTargets : availablePeers;
  const target = targetPool[Math.floor(rng() * targetPool.length)];
  usedShoutouts.add(target.id);

  const templates = SHOUTOUT_TEMPLATES[personality];
  const candidates = templates.map((template) => template(target.name));
  return pickUniqueText(rng, candidates, usedPhrases);
}

function buildSegment(
  segment: GoodbyeSegment,
  personality: GoodbyePersonality,
  player: Player,
  peers: Player[],
  rng: () => number,
  usedPhrases: Set<string>,
  usedShoutouts: Set<string>,
): string {
  if (segment === 'shoutout') {
    return buildShoutoutSegment(personality, player, peers, rng, usedPhrases, usedShoutouts);
  }

  const pool = [
    ...BASE_SEGMENTS[segment],
    ...(PERSONALITY_SEGMENTS[personality][segment] ?? []),
  ];
  return pickUniqueText(rng, pool, usedPhrases);
}

export function generateFinalGoodbyeMessage(
  player: Player,
  peers: Player[],
  rng: () => number,
  usedPhrases = new Set<string>(),
  usedLines = new Set<string>(),
  usedShoutouts = new Set<string>(),
  personality = inferGoodbyePersonality(player),
): FinalGoodbyeMessage {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const segmentTypes = chooseSegmentTypes(personality, pickSegmentCount(personality, rng), peers, rng);
    const segments = segmentTypes
      .map((segment) => buildSegment(segment, personality, player, peers, rng, usedPhrases, usedShoutouts));
    const text = segments.join(' ');
    if (!usedLines.has(text)) {
      usedLines.add(text);
      return {
        player,
        personality,
        segmentTypes,
        segments,
        text,
      };
    }
  }

  const fallback = pickUniqueText(rng, FALLBACK_LINES, usedPhrases);
  usedLines.add(fallback);
  return {
    player,
    personality,
    segmentTypes: ['reflection'],
    segments: [fallback],
    text: fallback,
  };
}

export function buildFinalGoodbyeMessages(
  players: Player[],
  season: number,
  seed: number,
): FinalGoodbyeMessage[] {
  const rng = mulberry32(seed ^ Math.imul(season, 0x9e3779b1) ^ players.length);
  const usedPhrases = new Set<string>();
  const usedLines = new Set<string>();
  const usedShoutouts = new Set<string>();

  return players.map((player) => generateFinalGoodbyeMessage(
    player,
    players,
    rng,
    usedPhrases,
    usedLines,
    usedShoutouts,
  ));
}
