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
  nomination_sympathy: [
    'The audience was not ready to see this one on the block — the sympathy is real.',
    'Viewers were not happy about that nomination, and the groundswell of support speaks for itself.',
    'The crowd latched on immediately. That nomination may have backfired in the court of public opinion.',
    'That unexpected nomination just handed somebody a very loyal fan base overnight.',
    'Social media is rallying hard. Putting a fan favourite on the block rarely goes quietly.',
  ],
  hoh_nomination_backlash: [
    'The nomination choice did not land well with viewers. The backlash is already building.',
    'Public sentiment swung hard the moment that name was announced. Not a popular move.',
    'Fans are not happy about who ended up on the block. The comments are not kind.',
    'That nomination is going to cost something in the public eye — viewers were invested in that person.',
    'The crowd turned quickly. Nominating someone beloved rarely plays well outside the house.',
  ],
  eviction_beloved: [
    'The live-feed community has not recovered from that eviction. The outrage is real.',
    'Fans are furious. Sending a crowd favourite home this early has consequences.',
    'Viewers are treating this like a season-defining moment — and not in a positive way for whoever is responsible.',
    'Social media is in full mourning mode. That eviction hit hard.',
    'The backlash following that eviction is loud, sustained, and very pointed.',
  ],
  eviction_underdog_exit: [
    'Even as they walked out the door, a small farewell wave of sympathy followed them out.',
    'Not everyone wanted to see them go — a quiet pocket of viewers is sad to see the end of that storyline.',
    'That exit earned a surprising amount of goodwill. Even the least popular players get their goodbye moment.',
    'The audience is complicated. Some fans are already missing the chaos that person brought.',
    'A small but vocal part of the fanbase is already saying they miss the entertainment value.',
  ],
  eviction_reaction: [
    'The public already has opinions about who is responsible for that eviction.',
    'Blame and credit are being assigned at speed across every platform right now.',
    'Viewers are reading the room and deciding who deserves the fallout.',
    'That eviction just reshuffled who the crowd is rooting for.',
    'The jury of public opinion has reached its verdict — and quickly.',
  ],
  pov_save: [
    'Using that power to help someone out played really well with the audience.',
    'That save just earned a whole lot of goodwill from the public.',
    'The crowd appreciated that protective instinct — using power to shield someone is always a good look.',
    'Viewers are responding warmly to that veto play.',
    'Stepping in to help just translated directly into public support.',
  ],
  pov_save_reaction: [
    'Using that power just shifted public opinion in an interesting direction.',
    'The veto play got noticed — viewers have decided whether that was a good idea.',
    'Fans are split on that save, but they are definitely paying attention.',
    'The public reacted to that veto usage immediately, and loudly.',
    'Using that protection sent a message. The audience received it.',
  ],
  public_save: [
    'The public stepped in to save one of their favourites, and the house felt it.',
    'An outside intervention just proved how much the audience is invested this season.',
    'The crowd spoke and someone got to stay. That kind of influence always creates waves inside.',
    'A twist driven by public will just changed the trajectory of the game.',
    'Viewers exercised their power and someone breathed a very big sigh of relief.',
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
  headline_positive: [
    'Social media lit up practically overnight — the fan base is growing fast.',
    'A viral clip dropped and the crowd reaction has been overwhelmingly warm.',
    'Fan accounts are going wild. The support this week has been genuinely extraordinary.',
    'The viewers latched onto that moment and sent approval through the roof.',
    "A crowd-pleasing move just became the season's most-discussed beat.",
    "Redemption arcs are the internet's favorite thing right now, and this one is no exception.",
    'The public has spoken and it is extremely loud in the right direction.',
    'Underdog energy is magnetic, and the audience just proved it with a massive swell of support.',
    'That wholesome exchange made the highlight reel and fans are absolutely here for it.',
    'A genuine connection moment just earned a wave of goodwill from the audience.',
  ],
  headline_negative: [
    'Leaked house footage has the internet deeply unimpressed right now.',
    'The public backlash is real — viewers are not letting this one go quietly.',
    'Fans are calling it out loudly and the sentiment is not kind.',
    'A rumor is spreading fast and people are choosing to believe the worst.',
    'That backstab just became the most-clipped moment of the week for all the wrong reasons.',
    'Social media has decided there is a villain in the house and the verdict is not flattering.',
    'The audience watched that unfold in real time and the reaction has been scalding.',
    'A very ugly side just got very visible, and viewers are circulating the receipts.',
    'Outrage is the only word for what the comments section looks like right now.',
    'The crowd was rooting for better and got the opposite. The mood has curdled.',
  ],
  headline_drama: [
    'The live-feed communities are absolutely obsessed with this storyline right now.',
    'That confrontation just crashed the fan forum servers.',
    'Chaos found a new spokesperson and the ratings suggest viewers love it.',
    'Nobody saw that shock coming, and the audience has been screaming about it ever since.',
    'The drama hit a new level and the public is genuinely gripped.',
    'A bombshell just dropped and the reaction threads are moving at light speed.',
    'That moment will be dissected for weeks. The audience cannot look away.',
    'The entire fan base seems to be picking sides and neither camp is quiet about it.',
    "A wildcard play just reshuffled the public's entire read on this season.",
    'Nobody expected that energy and the internet rewarded the surprise with full attention.',
  ],
  high_quality_social_play: [
    'A composed social move made the player look more connected and in control.',
    'Viewers responded well to a relationship-building move that felt genuine.',
    'A strong social read translated into a modest gain with the audience.',
  ],
  poor_social_play: [
    'A social move landed awkwardly and cost a little public confidence.',
    'Viewers read that exchange as forced rather than convincing.',
    'The interaction did not land, and the audience noticed the misread.',
  ],
  audience_social_warmth: [
    'Viewers are warming to the way this housemate is connecting without forcing it.',
    'A run of genuine conversations is quietly winning people over.',
    'The audience is responding to a social game that feels natural rather than rehearsed.',
  ],
  audience_strategy: [
    'Viewers are starting to respect how calmly this housemate is building numbers.',
    'A few subtle strategic conversations made this game look sharper today.',
    'The audience noticed a social move that created options without creating noise.',
  ],
  audience_conflict_fatigue: [
    'The constant tension is starting to feel exhausting rather than entertaining.',
    'Viewers are losing patience with a pattern of unnecessary conflict.',
    'Another strained exchange made the social game look harder than it needed to be.',
  ],
  audience_social_overexposure: [
    'Being in every conversation is starting to look less social and more frantic.',
    'Viewers noticed the overplaying today, and the impression was not flattering.',
    'Too many visible moves at once made the strategy look nervous.',
  ],
  vote_promise_kept: [
    'Viewers saw the vote match the promise, and the consistency earned a little respect.',
  ],
  vote_promise_broken: [
    'The broadcast exposed a promise that did not match the vote.',
  ],
  conflicting_vote_promises: [
    'Viewers caught the same vote being promised to both nominees. The contradiction did not go unnoticed.',
  ],
  audience_reconsideration: [
    'After a rough stretch, part of the audience is beginning to reconsider.',
    'The initial backlash is cooling and a small recovery is taking hold.',
    'A few viewers are giving this storyline another chance.',
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
} as const

type NarrativeKey = keyof typeof NARRATIVE_VARIANTS

const REASON_ALIASES: Record<string, NarrativeKey> = {
  hoh_win: 'hoh_win',
  'Won Leader of the House': 'hoh_win',
  pov_win: 'pov_win',
  'Won Power of Safety': 'pov_win',
  nominated: 'nominated',
  'Was on the block': 'nominated',
  nomination_sympathy: 'nomination_sympathy',
  hoh_nomination_backlash: 'hoh_nomination_backlash',
  eviction_beloved: 'eviction_beloved',
  eviction_underdog_exit: 'eviction_underdog_exit',
  eviction_reaction: 'eviction_reaction',
  pov_save: 'pov_save',
  pov_save_reaction: 'pov_save_reaction',
  public_save: 'public_save',
  direction_completed: 'direction_completed',
  direction_failed: 'direction_failed',
  headline_positive: 'headline_positive',
  headline_negative: 'headline_negative',
  headline_drama: 'headline_drama',
  high_quality_social_play: 'high_quality_social_play',
  poor_social_play: 'poor_social_play',
  audience_social_warmth: 'audience_social_warmth',
  audience_strategy: 'audience_strategy',
  audience_conflict_fatigue: 'audience_conflict_fatigue',
  audience_social_overexposure: 'audience_social_overexposure',
  vote_promise_kept: 'vote_promise_kept',
  vote_promise_broken: 'vote_promise_broken',
  conflicting_vote_promises: 'conflicting_vote_promises',
  audience_reconsideration: 'audience_reconsideration',
}

function hashString(text: string): number {
  let hash = 0
  for (let charIndex = 0; charIndex < text.length; charIndex += 1) {
    hash = (hash * 31 + text.charCodeAt(charIndex)) | 0
  }
  return Math.abs(hash)
}

function resolveNarrativeKey(reason: string, delta: number): NarrativeKey {
  const aliased = REASON_ALIASES[reason]
  if (aliased) return aliased
  if (delta > 0) return 'generic_positive'
  if (delta < 0) return 'generic_negative'
  return 'generic_neutral'
}

export function createPublicNarrative(params: {
  reason: string
  playerId: string
  delta: number
  week: number
}): string {
  const { reason, playerId, delta, week } = params
  const key = resolveNarrativeKey(reason, delta)
  const variants = NARRATIVE_VARIANTS[key]
  const variantIndex = hashString(`${reason}:${playerId}:${week}:${delta}`) % variants.length
  return variants[variantIndex]
}
