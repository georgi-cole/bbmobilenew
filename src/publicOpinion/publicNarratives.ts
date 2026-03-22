const NARRATIVE_VARIANTS = {
  hoh_win: [
    'The crown found a new head, and the crowd absolutely clocked it.',
    'A power swing just landed with all the subtlety of a confetti cannon.',
    'Somebody walked away with the room keys and a whole lot of attention.',
    'The balance in the house shifted, and viewers felt every inch of it.',
    'A very shiny seat of power just got claimed.',
  ],
  pov_win: [
    'A timely safety gadget changed hands tonight.',
    'Someone just grabbed the kind of protection that makes whispers louder.',
    'A little immunity sparkle appeared at exactly the right moment.',
    'The panic button now belongs to somebody else.',
    'A well-timed shield just made the house a lot messier.',
  ],
  nominated: [
    'The room suddenly felt a touch less cozy for somebody.',
    'A rough headline night just hit the house.',
    'The audience picked up on a very awkward vibe shift.',
    'Somebody just landed on the wrong side of the house mood.',
    'There was a little too much side-eye in the air tonight.',
  ],
  direction_completed: [
    'The audience got exactly the kind of mess it ordered.',
    'That move landed like prime-time television.',
    'Somebody just gave the viewers a very satisfying episode.',
    'The crowd seems delighted by the latest bit of chaos.',
    'A watchable little moment just turned into a crowd-pleaser.',
  ],
  direction_failed: [
    'The audience was promised a moment and got a shrug instead.',
    'That setup had potential, but the payoff never fully arrived.',
    'The crowd was ready for fireworks and mostly got damp glitter.',
    'A very watchable opportunity slipped quietly into the void.',
    'The viewers were waiting for a splash and got a polite ripple.',
  ],
  generic_positive: [
    'The audience is warming up a little more than expected.',
    'That last beat played surprisingly well with viewers.',
    'Some goodwill just quietly rolled in from the public.',
    'The crowd seems a bit more charmed right now.',
  ],
  generic_negative: [
    'The audience looks a little less impressed after that.',
    'A messy beat just nudged public sentiment in the wrong direction.',
    'The crowd seems slightly less enchanted right now.',
    'That moment did not exactly help with the group chat.',
  ],
  generic_neutral: [
    'The public is watching, but nobody moved the needle much.',
    'The mood stayed mostly steady on that one.',
    'Viewers noticed it, but they did not exactly gasp.',
  ],
} as const;

type NarrativeKey = keyof typeof NARRATIVE_VARIANTS;

const REASON_ALIASES: Record<string, NarrativeKey> = {
  hoh_win: 'hoh_win',
  'Won Head of Household': 'hoh_win',
  pov_win: 'pov_win',
  'Won Power of Veto': 'pov_win',
  nominated: 'nominated',
  'Was on the block': 'nominated',
  direction_completed: 'direction_completed',
  direction_failed: 'direction_failed',
};

function hashString(text: string): number {
  let hash = 0;
  for (let charIndex = 0; charIndex < text.length; charIndex += 1) {
    hash = (hash * 31 + text.charCodeAt(charIndex)) | 0;
  }
  return Math.abs(hash);
}

function resolveNarrativeKey(reason: string, delta: number): NarrativeKey {
  const aliased = REASON_ALIASES[reason];
  if (aliased) return aliased;
  if (delta > 0) return 'generic_positive';
  if (delta < 0) return 'generic_negative';
  return 'generic_neutral';
}

export function createPublicNarrative(params: {
  reason: string;
  playerId: string;
  delta: number;
  week: number;
}): string {
  const { reason, playerId, delta, week } = params;
  const key = resolveNarrativeKey(reason, delta);
  const variants = NARRATIVE_VARIANTS[key];
  const variantIndex = hashString(`${reason}:${playerId}:${week}:${delta}`) % variants.length;
  return variants[variantIndex];
}
