import type { BroadcastCampaign, BroadcastLevel, Phase, TvEvent } from '../types'

export type BroadcastTemplateKind = 'feed' | 'phase_card'

export interface BroadcastTemplate {
  id: string
  phase: Phase
  kind: BroadcastTemplateKind
  text: string
  title?: string
  type: TvEvent['type']
  level: BroadcastLevel
  major?: string
  /** Default faux-TV routing for a plain feed message. Cards are always routed. */
  forceOnTv?: boolean
  /** Undefined templates are shared across all campaigns. */
  campaign?: BroadcastCampaign
  note?: string
}

export const BROADCAST_CAMPAIGNS: readonly BroadcastCampaign[] = [
  'classic',
  'survival',
  'cupid',
  'vox_populi',
  'depression_shock',
]

export const BROADCAST_CAMPAIGN_LABELS: Record<BroadcastCampaign, string> = {
  classic: 'Classic',
  survival: 'Surveyeval',
  cupid: "Cupid's Arrow",
  vox_populi: 'Vox Populi',
  depression_shock: 'Depression Shock',
}

export interface BroadcastTemplateMatch {
  template: BroadcastTemplate
  variables: string[]
}

const feed = (
  id: string,
  phase: Phase,
  text: string,
  type: TvEvent['type'] = 'game', // i18n-ignore: Internal event enum value, not player-facing copy
  level: BroadcastLevel = 'minor', // i18n-ignore: Internal priority enum value, not player-facing copy
  major?: string,
  note?: string,
  forceOnTv = true,
  campaign?: BroadcastCampaign
): BroadcastTemplate => ({
  id,
  phase,
  kind: 'feed',
  text,
  type,
  level,
  major,
  forceOnTv,
  campaign,
  note,
})

const card = (
  id: string,
  phase: Phase,
  title: string,
  text: string,
  major: string,
  note?: string,
  level: BroadcastLevel = 'major',
  campaign?: BroadcastCampaign
): BroadcastTemplate => ({
  id,
  phase,
  kind: 'phase_card',
  title,
  text,
  type: 'game',
  level,
  major,
  forceOnTv: true,
  campaign,
  note,
})

/** Every phase value, including twist and interactive minigame sub-phases. */
export const ALL_BROADCAST_PHASES: readonly Phase[] = [
  'season_start',
  'week_start',
  'loh_comp_announcement',
  'loh_comp',
  'loh_results',
  'democracia_vote',
  'democracia_results',
  'social_1',
  'nominations',
  'nomination_results',
  'pre_veto_public_save',
  'pos_comp_announcement',
  'pos_comp',
  'pos_results',
  'pos_ceremony',
  'pos_ceremony_results',
  'social_2',
  'live_vote',
  'eviction_results',
  'week_end',
  'final4_eviction',
  'final3',
  'final3_comp1',
  'final3_comp1_minigame',
  'final3_comp2',
  'final3_comp2_minigame',
  'final3_comp3',
  'final3_comp3_minigame',
  'final3_decision',
  'jury_announcement',
  'jury_cinematic',
  'jury',
]

/**
 * Registry used by both the game emitter and Broadcast Manager. Braced values
 * are capture slots: an edited template keeps the live player/day values.
 */
export const BROADCAST_TEMPLATE_CATALOG: readonly BroadcastTemplate[] = [
  feed(
    'season.welcome',
    'season_start',
    'Welcome to The Big Eye hub! 🏠 Season {season} is about to begin.',
    'game',
    'minor',
    undefined,
    'Legacy log entry; SeasonStartOnboardingController owns the polished faux-TV welcome.',
    false
  ),
  feed(
    'season.welcome-cupid',
    'season_start',
    'The Big Eye hub is now filled with love! 🏠 Season {season} is about to begin. Get some chocolate and press play.',
    'game',
    'minor',
    undefined,
    "Cupid's Arrow legacy log entry; the onboarding controller owns the faux-TV welcome.",
    false,
    'cupid'
  ),
  feed(
    'season.public-mode-rule',
    'season_start',
    '[Rules] Public mode: {status}',
    'game',
    'minor',
    undefined,
    'Service configuration · log only',
    false
  ),
  feed(
    'season.vox-populi-intro',
    'season_start',
    'VOX POPULI is now in force. Housemates nominate in secret, the audience decides who leaves, and Public Mode reveals the pulse without changing the official result.',
    'twist',
    'critical',
    'vox_populi',
    'Vox Populi seasons only',
    true,
    'vox_populi'
  ),
  feed(
    'survival.opening',
    'week_start',
    'Surveyeval Mode online. Eight contestants enter; synthetic replacements keep the board full after every robo eviction.',
    'game',
    'major',
    'surveyeval_opening',
    'Surveyeval opening',
    true,
    'survival'
  ),
  feed(
    'survival.rules',
    'week_start',
    '[Rules] Public mode: OFF | Social mode: OFF | Endless days: ON | Double Elimination: possible',
    'game',
    'minor',
    undefined,
    'Surveyeval service configuration · log only',
    false,
    'survival'
  ),
  feed(
    'week.tribunal-start',
    'week_start',
    "Congrats all, you've just made it to tribunal. Your voices will crown the winner.",
    'game',
    'major',
    'tribunal_phase',
    'Only when the Tribunal stage begins'
  ),
  feed(
    'week.day-start',
    'week_start',
    'Day {day} has begun. Get ready.',
    'game',
    'minor',
    undefined,
    undefined,
    true
  ),
  card(
    'card.loh',
    'loh_comp_announcement',
    'LOH Competition',
    'Control is up for winning — who will become Leader of the Hub?',
    'loh_comp_announcement'
  ),
  card(
    'card.democracia',
    'loh_comp_announcement',
    'DEMOCRACIA!',
    'The house will elect the new Leader of the House by secret vote.',
    'democracia',
    'Democracia branch',
    'critical'
  ),
  card(
    'card.vox-immunity',
    'loh_comp_announcement',
    'Immunity Competition',
    'One housemate can earn safety from the public vote.',
    'vox_immunity_comp',
    'Vox Populi branch',
    'major',
    'vox_populi'
  ),
  card(
    'card.vox-final4-competition',
    'loh_comp_announcement',
    'Final 4 Competition',
    'No immunity is awarded today. Last place begins on the block; the other three each cast one secret vote.',
    'vox_final4_immunity_comp',
    'Vox Populi Final 4 branch',
    'major',
    'vox_populi'
  ),
  feed(
    'loh.competition-start',
    'loh_comp',
    'The Leader of the House competition has begun! 🏆 Who will win power today?'
  ),
  feed(
    'loh.democracia-vote-start',
    'loh_comp',
    "🗳️ Today's Leader of the House will be chosen by popular vote! Cast your votes now.",
    'game',
    'major',
    'democracia'
  ),
  feed('loh.winner', 'loh_results', '{winner} has won Leader of the House! 👑'),
  feed(
    'loh.cupid-winners',
    'loh_results',
    "{winner} won Leader of the House, making {partner} co-LOH under Cupid's Arrow! 👑💘",
    'game',
    'minor',
    undefined,
    "Cupid's Arrow branch"
  ),
  feed(
    'cupid.activation',
    'season_start',
    '🏹 The lights soften. A golden arrow crosses the house, splitting into eight trails of light. Cupid has chosen: {pairs}. From this moment, every victory, every danger, every vote, and every exit belongs to the pair. 💘',
    'twist',
    'critical',
    'cupid_arrow',
    "Cupid's Arrow opening",
    true,
    'cupid'
  ),
  feed(
    'shock.vox-double-eviction',
    'nominations',
    'DOUBLE ELIMINATION! The public vote will eliminate two housemates tonight.',
    'twist',
    'critical',
    'vox_double_eviction',
    'Vox Populi double-elimination shock',
    true,
    'vox_populi'
  ),
  feed(
    'shock.vip-veto',
    'pos_ceremony',
    'DOUBLE TROUBLE! The Safety power may be used twice this ceremony. 👑',
    'twist',
    'critical',
    'vip_veto',
    'Special Safety shock'
  ),
  feed(
    'shock.diamond-pov',
    'pos_ceremony',
    'HALO EXCHANGE! The Safety holder may name the backup nominee. 😇',
    'twist',
    'critical',
    'diamond_pov',
    'Special Safety shock'
  ),
  feed(
    'shock.coup-detat',
    'pos_ceremony',
    'DETOX! Both nominees are cleared and two replacements must be named. ⚡',
    'twist',
    'critical',
    'coup_detat',
    'Special Safety shock'
  ),
  feed(
    'shock.spotlight-veto',
    'pos_ceremony',
    'FORCE MAJEURE! The Safety holder is forced to use the power. ✨',
    'twist',
    'critical',
    'spotlight_veto',
    'Special Safety shock'
  ),
  feed(
    'shock.battle-back',
    'eviction_results',
    'BACK 2 THE GAME! Eliminated housemates will compete for a return.',
    'twist',
    'critical',
    'battle_back',
    'Battle Back shock'
  ),
  feed(
    'shock.battle-back-shock',
    'eviction_results',
    'SHOCK TWIST! Back 2 the Game has been activated.',
    'twist',
    'critical',
    'battle_back_shock',
    'Battle Back shock'
  ),
  feed(
    'shock.battle-back-rules',
    'eviction_results',
    'BACK 2 THE GAME RULES! Tribunal members face off; only one can return.',
    'twist',
    'critical',
    'battle_back_rules',
    'Battle Back shock'
  ),
  feed(
    'shock.battle-back-challenge',
    'eviction_results',
    'BACK 2 THE GAME CHALLENGE! Press play to begin the showdown.',
    'twist',
    'critical',
    'battle_back_challenge',
    'Battle Back shock'
  ),
  feed(
    'shock.democracia',
    'loh_comp',
    'DEMOCRACIA! The house will elect its Leader by popular vote.',
    'twist',
    'critical',
    'democracia',
    'Democracia shock'
  ),
  feed(
    'loh.vox-last-place',
    'loh_results',
    "{player} finished in last place in the immunity competition and is now on the block for today's audience vote.",
    'game',
    'minor',
    undefined,
    'Vox Populi automatic nominee; ordinary result copy, never a shock card',
    true,
    'vox_populi'
  ),
  card(
    'card.democracia-vote',
    'democracia_vote',
    'DEMOCRACIA!',
    'The house votes by secret ballot to elect the Leader of the House.',
    'democracia',
    undefined,
    'critical'
  ),
  feed(
    'democracia.winner',
    'democracia_vote',
    '🗳️ {winner} has been elected Leader of the House! 👑'
  ),
  feed(
    'democracia.public-tiebreak',
    'democracia_vote',
    '🗳️ Even after the ballotage, {players} are still tied! The public will decide by approval rating! 📊'
  ),
  feed(
    'democracia.co-leaders',
    'democracia_vote',
    '🗳️ The votes remain tied! {players} will BOTH serve as co-Leaders of the House! 👑👑'
  ),
  feed(
    'democracia.no-voters',
    'democracia_vote',
    '⚠️ No eligible voters available for ballotage. The winner is decided by chance!'
  ),
  feed(
    'democracia.ballotage',
    'democracia_vote',
    "🗳️ It's a tie between {players}! We go to BALLOTAGE! All other houseguests must revote between the tied candidates. 🗳️"
  ),
  feed(
    'democracia.co-loh-social',
    'democracia_results',
    '{players} are now co-Leaders of the House! 👑👑 Alliances are already forming…',
    'social'
  ),
  feed(
    'democracia.social',
    'democracia_results',
    'Housemates congratulate {winner}. Alliances are already forming… 💬',
    'social'
  ),
  feed(
    'democracia.vox-social',
    'democracia_results',
    'Housemates congratulate {winner} on winning immunity. The secret nomination conversations begin. 💬',
    'social',
    'minor',
    undefined,
    'Vox Populi branch',
    true,
    'vox_populi'
  ),
  feed(
    'social.loh-congratulations',
    'social_1',
    'Housemates congratulate {winner}. Alliances are already forming… 💬',
    'social'
  ),
  card(
    'card.nominations',
    'nominations',
    'Nomination Ceremony',
    'The Leader of the House will reveal who is in danger.',
    'nomination_ceremony'
  ),
  card(
    'card.double-eviction',
    'nominations',
    'Double Elimination!',
    'Tonight, two housemates will leave the game.',
    'double_eviction',
    'Double Elimination branch'
  ),
  card(
    'card.vox-nominations',
    'nominations',
    'Secret Nominations',
    'Housemates nominate privately in the Confessional.',
    'vox_nominations',
    'Vox Populi branch',
    'major',
    'vox_populi'
  ),
  feed('nominations.preparing', 'nominations', '{leader} is preparing the nomination ceremony. 🎯'),
  feed(
    'nominations.vox-confessional',
    'nominations',
    'Housemates are being called to the Confessional one by one to nominate in secret. 🗳️',
    'game',
    'minor',
    undefined,
    'Vox Populi branch',
    true,
    'vox_populi'
  ),
  feed(
    'nominations.human-prompt',
    'nomination_results',
    "{leader}, it's time to make your nominations. Choose {count} players to nominate. 🎯"
  ),
  feed(
    'nominations.co-loh-prompt',
    'nomination_results',
    '{leader}, as co-Leader of the House, you must nominate one houseguest for elimination. 🎯'
  ),
  feed('nominations.co-loh-pick', 'nomination_results', '{leader} nominates {nominee}. 🎯'),
  feed(
    'nominations.vox-ballot',
    'nomination_results',
    '{player}, cast {ballot} in the Confessional.',
    'diary',
    'minor',
    undefined,
    'Vox Populi ballot confirmation; ordinary copy retained on the TV until the result follows',
    true,
    'vox_populi'
  ),
  feed(
    'nominations.vox-result-with-auto',
    'nomination_results',
    'The secret ballot is complete: {summary}. {nominees} {verb} {automaticNominee} on the block. They will face the audience vote.',
    'game',
    'minor',
    undefined,
    'Vox Populi secret-ballot result; ordinary copy, never a shock card',
    true,
    'vox_populi'
  ),
  feed(
    'nominations.vox-result',
    'nomination_results',
    'The secret ballot is complete: {summary}. {nominees} {verb} nominated for the audience vote.',
    'game',
    'minor',
    undefined,
    'Vox Populi secret-ballot result; ordinary copy, never a shock card',
    true,
    'vox_populi'
  ),
  feed(
    'nominations.vox-auto-remains',
    'nomination_results',
    '{automaticNominee} remains on the block for the audience vote.',
    'game',
    'minor',
    undefined,
    'Vox Populi secret-ballot result',
    true,
    'vox_populi'
  ),
  feed(
    'nominations.vox-ballot-complete',
    'nomination_results',
    'The secret ballot is complete.',
    'game',
    'minor',
    undefined,
    'Vox Populi secret-ballot result',
    true,
    'vox_populi'
  ),
  feed(
    'nominations.result',
    'nomination_results',
    '{nominees} have been nominated for elimination. 🎯'
  ),
  feed(
    'public-save.intro',
    'pre_veto_public_save',
    "The final list of nominees today will be decided with the public's help."
  ),
  card(
    'card.pos',
    'pos_comp_announcement',
    'Power of Safety',
    "It's time for the Power of Safety competition!",
    'pos_comp_announcement'
  ),
  feed('pos.competition-start', 'pos_comp', 'The Power of Safety competition is underway! 🎭'),
  feed('pos.winner', 'pos_results', '{winner} has won the Power of Safety! 🎭'),
  card(
    'card.safety',
    'pos_ceremony',
    'Safety Ceremony',
    'The Power of Safety holder will reveal their decision.',
    'veto_ceremony'
  ),
  card(
    'card.final4-safety',
    'pos_ceremony',
    'Final 4 — Safety Ceremony',
    'Only four players remain. The Power of Safety holder controls the sole vote.',
    'final4',
    'Final Four branch'
  ),
  card(
    'card.vox-safety',
    'pos_ceremony',
    'Safety Ceremony',
    'The safety decision can reshape the public vote.',
    'vox_safety_ceremony',
    'Vox Populi branch',
    'major',
    'vox_populi'
  ),
  feed('safety.holder', 'pos_ceremony', '{holder} is holding the Safety Ceremony. ⚡'),
  feed(
    'safety.secret-immunity',
    'pos_ceremony_results',
    '{player} may use a secret {days}-day immunity right now to escape the block before the Safety Ceremony concludes. 🛡️'
  ),
  feed(
    'safety.self-save',
    'pos_ceremony_results',
    '{holder} used the Power of Safety and saved themselves! ⚡'
  ),
  feed(
    'safety.vox-self-save',
    'pos_ceremony_results',
    '{saved} has saved {reflexive} from the block. {nominees} will now face the audience, who will decide whose game ends tonight.',
    'game',
    'minor',
    undefined,
    'Vox Populi Safety result; ordinary copy, never a shock card',
    true,
    'vox_populi'
  ),
  feed(
    'safety.vox-save',
    'pos_ceremony_results',
    '{holder} has saved {saved} from the block. {nominees} will now face the audience, who will decide whose game ends tonight.',
    'game',
    'minor',
    undefined,
    'Vox Populi Safety result; ordinary copy, never a shock card',
    true,
    'vox_populi'
  ),
  feed(
    'safety.vox-self-save-double',
    'pos_ceremony_results',
    '{saved} has saved {reflexive} from the block. {nominees} will now face the audience, and two of them will leave tonight.',
    'game',
    'minor',
    undefined,
    'Vox Populi Double Elimination Safety result; ordinary copy',
    true,
    'vox_populi'
  ),
  feed(
    'safety.vox-save-double',
    'pos_ceremony_results',
    '{holder} has saved {saved} from the block. {nominees} will now face the audience, and two of them will leave tonight.',
    'game',
    'minor',
    undefined,
    'Vox Populi Double Elimination Safety result; ordinary copy',
    true,
    'vox_populi'
  ),
  feed(
    'safety.vox-hold',
    'pos_ceremony_results',
    '{holder} has chosen not to use the Power of Safety. {nominees} {verb} on the block and will face the audience.',
    'game',
    'minor',
    undefined,
    'Vox Populi Safety stand-pat result; ordinary copy, never a shock card',
    true,
    'vox_populi'
  ),
  feed(
    'safety.save',
    'pos_ceremony_results',
    '{holder} used the Power of Safety to save {nominee}! ⚡'
  ),
  feed(
    'safety.hold',
    'pos_ceremony_results',
    '{holder} chose not to use the Power of Safety. The nominations remain unchanged.'
  ),
  feed(
    'safety.replacement-needed',
    'pos_ceremony_results',
    '{leader} must now name a backup nominee. 🎯'
  ),
  feed(
    'safety.replacement-selecting',
    'pos_ceremony_results',
    '{leader} is selecting a backup nominee...'
  ),
  feed(
    'safety.replacement',
    'pos_ceremony_results',
    '{leader} named {nominee} as the backup nominee. 🎯'
  ),
  feed(
    'safety.force-majeure',
    'pos_ceremony_results',
    '{holder} used Force Majeure and saved themselves! ✨'
  ),
  feed(
    'safety.halo',
    'pos_ceremony_results',
    '{holder} used Halo Exchange and saved themselves! 😇'
  ),
  feed('safety.halo-prompt', 'pos_ceremony_results', '{holder}, will you use Halo Exchange? 😇'),
  feed(
    'safety.double-trouble',
    'pos_ceremony_results',
    '{holder} used Double Trouble and saved themselves! 👑'
  ),
  feed(
    'social.final-pitches',
    'social_2',
    'The nominees make their final pitches before the vote.',
    'social'
  ),
  feed(
    'vox.social-tearful-apology',
    'social_2',
    "A nominee's tearful apology turned into an argument when someone challenged the timing. {nominees} now have the whole house watching.",
    'social',
    'minor',
    undefined,
    'Vox Populi social colour; emitted only after the final block is confirmed',
    true,
    'vox_populi'
  ),
  feed(
    'vox.social-final-appeals',
    'social_2',
    '{nominees} have made their final appeals. The house can offer support, but only the audience will decide.',
    'social',
    'minor',
    undefined,
    'Last pre-vote Vox Populi social beat',
    true,
    'vox_populi'
  ),
  card(
    'card.live-vote',
    'live_vote',
    'Live Elimination',
    'The house will vote to eliminate.',
    'live_eviction'
  ),
  card(
    'card.vox-public-vote',
    'live_vote',
    'Public Vote',
    'The audience decides who leaves.',
    'vox_public_vote',
    'Vox Populi branch',
    'major',
    'vox_populi'
  ),
  feed(
    'vote.final-pitches',
    'live_vote',
    'Housemates give their last plea before voting begins.',
    'social'
  ),
  feed(
    'vote.tie-loh',
    'eviction_results',
    "It's a tie between {nominees}! {leader}, as LOH you must break the tie. 🗳️"
  ),
  feed(
    'vote.tie-pos',
    'eviction_results',
    "It's a tie between {nominees}! {holder}, as POS holder, you must break the tie as a special exception. 🗳️"
  ),
  feed(
    'vote.evicted',
    'eviction_results',
    '{evictee}, you have been eliminated from The Big Eye house. 🚪'
  ),
  feed(
    'cupid.spell-broken',
    'eviction_results',
    "💔 Four pairs have fallen. Cracks race through Cupid's hearts, the final arrow dissolves into light, and Cupid takes flight from The Big Eye house. The rose glow fades: every survivor now plays alone. What the pairs felt—and what they did to each other—remains.",
    'twist',
    'critical',
    'cupid_arrow_broken',
    "Cupid's Arrow ending",
    true,
    'cupid'
  ),
  feed(
    'cupid.pair-eviction',
    'eviction_results',
    "{players}, Cupid's Arrow means you are eliminated together. 💔",
    'game',
    'major',
    'cupid_pair_eviction',
    "Cupid's Arrow eviction",
    true,
    'cupid'
  ),
  feed(
    'cupid.pair-tiebreak-eviction',
    'eviction_results',
    "{leader} breaks the tie. {players}, Cupid's Arrow means you are eliminated together. 💔",
    'game',
    'major',
    'cupid_pair_eviction',
    "Cupid's Arrow tie-break eviction",
    true,
    'cupid'
  ),
  feed(
    'cupid.partner-eviction',
    'eviction_results',
    "{partner} is bound to {evictee} by Cupid's Arrow and is eliminated too. 💔",
    'game',
    'major',
    'cupid_partner_eviction',
    "Cupid's Arrow paired exit",
    true,
    'cupid'
  ),
  feed(
    'cupid.self-eviction-pair',
    'eviction_results',
    "{player} has chosen to self-evict. Cupid's Arrow also eliminates {partner}. 🚪💔",
    'game',
    'major',
    'cupid_pair_eviction',
    "Cupid's Arrow paired exit",
    true,
    'cupid'
  ),
  feed(
    'cupid.pair-tiebreak-prompt',
    'eviction_results',
    'The nominated pairs are tied. {leader}, your LOH pair must decide which pair leaves. 🗳️',
    'game',
    'major',
    'cupid_pair_tiebreak',
    "Cupid's Arrow tie-break",
    true,
    'cupid'
  ),
  feed(
    'survival.run-ended',
    'eviction_results',
    'Surveyeval run ended. You were eliminated on Day {day}.',
    'game',
    'major',
    'surveyeval_ended',
    'Surveyeval ending',
    true,
    'survival'
  ),
  feed(
    'survival.replacement-enters',
    'eviction_results',
    '{player} enters as a replacement synthetic contestant.',
    'game',
    'minor',
    undefined,
    'Surveyeval replacement arrival.',
    true,
    'survival'
  ),
  feed(
    'week.day-start-mood.sunny',
    'week_start',
    'Sunlight found every window this morning. The house feels ready for something good.',
    'social',
    'minor',
    undefined,
    'Day-start mood copy · sunny variant',
    false
  ),
  card(
    'depression-shock.opening',
    'week_start',
    'Depression Shock',
    'A storm has settled over the hub. The rain will not let up, and a deep melancholy is changing how the players think, speak, and play.',
    'depression_shock_start',
    'Opening cinematic and faux-TV handoff for Depression Shock.',
    'critical',
    'depression_shock'
  ),
  feed(
    'depression-shock.day1-silence',
    'social_1',
    'The rain has swallowed the usual noise. Conversations start softly and end before anyone says what they mean.',
    'social',
    'minor',
    undefined,
    'Editable Day 1 melancholic faux-TV message.',
    true,
    'depression_shock'
  ),
  feed(
    'depression-shock.day1-night',
    'week_end',
    'Night gathers behind rain-streaked windows. Nobody is quite ready to admit how heavy the hub feels.',
    'social',
    'minor',
    undefined,
    'Editable end-of-Day-1 message.',
    true,
    'depression_shock'
  ),
  card(
    'depression-shock.day2-colour-drains',
    'week_start',
    'The colour drains away',
    'The storm has deepened. Today the hub loses most of its colour, and every familiar room feels colder.',
    'depression_shock_day_2',
    'Day 2 saturation explanation on the faux TV.',
    'critical',
    'depression_shock'
  ),
  feed(
    'depression-shock.chocolates',
    'social_1',
    'The Big Eye has left chocolates for everyone. Wrappers open in the quiet, but the rain keeps speaking louder. 🍫',
    'social',
    'major',
    'depression_shock_chocolates',
    'Editable Day 2 chocolate delivery.',
    true,
    'depression_shock'
  ),
  feed(
    'depression-shock.day2-melancholy',
    'social_2',
    'A few pieces of chocolate are gone. The grey light remains, and even laughter sounds borrowed today.',
    'social',
    'minor',
    undefined,
    'Editable Day 2 melancholic faux-TV message.',
    true,
    'depression_shock'
  ),
  card(
    'depression-shock.recovery',
    'week_start',
    'The sun returns',
    'Morning light breaks through the clouds. Colour returns, familiar faces reappear, and the hub finally exhales.',
    'depression_shock_end',
    'Day 3 recovery broadcast after the sunrise cinematic.',
    'critical',
    'depression_shock'
  ),
  feed(
    'week.day-start-mood.cloudy',
    'week_start',
    'Soft clouds are drifting past outside. Inside, the house is taking its sweet time waking up.',
    'social',
    'minor',
    undefined,
    'Day-start mood copy · cloudy variant',
    false
  ),
  feed(
    'week.day-start-mood.rainy',
    'week_start',
    'Rain is tapping at the windows, but hot cocoa is waiting in the kitchen — courtesy of {friend}.',
    'social',
    'minor',
    undefined,
    'Day-start mood copy · rainy variant',
    false
  ),
  feed('week.day-end', 'week_end', 'Day {day} has come to an end. A new day begins soon…'),
  feed(
    'week.day-end-mood.sunset',
    'week_end',
    'The last warm light is slipping behind the house. Everything can wait until morning.',
    'social',
    'minor',
    undefined,
    'Day-end mood copy · sunset variant',
    false
  ),
  feed(
    'week.day-end-mood.starry',
    'week_end',
    'The house has gone quiet beneath a clear night sky. Even the game seems far away for a moment.',
    'social',
    'minor',
    undefined,
    'Day-end mood copy · starry variant',
    false
  ),
  feed(
    'week.day-end-mood.rainy',
    'week_end',
    'Rain hums softly beyond the glass. Somewhere inside, {friend} has left the kettle warm.',
    'social',
    'minor',
    undefined,
    'Day-end mood copy · rainy variant',
    false
  ),
  card(
    'card.final4',
    'final4_eviction',
    'Final Four',
    'The Power of Safety holder will cast the sole vote.',
    'final4'
  ),
  feed('final4.pleas-start', 'final4_eviction', '{holder} asks nominees for their pleas. 🎤'),
  feed('final4.plea', 'final4_eviction', '{nominee}: "{plea}"'),
  card(
    'card.final3',
    'final3',
    'The Finale',
    'Three players remain — the three-part Final LOH begins.',
    'final3_announcement'
  ),
  card(
    'card.vox-final3',
    'final3',
    'Final 3',
    'One housemate will win immunity. The audience will decide third place.',
    'vox_final3',
    'Vox Populi branch',
    'major',
    'vox_populi'
  ),
  feed(
    'vox.final3-start',
    'final3',
    'Final 3! {finalists} remain. The final immunity journey begins now.',
    'game',
    'major',
    'vox_final3',
    'Vox Populi final-three transition.',
    true,
    'vox_populi'
  ),
  feed(
    'final3.part1-start',
    'final3_comp1',
    'Final 3 Part 1 is underway! All three players compete for the first leg of the Final LOH. 🏁'
  ),
  feed(
    'final3.part1-result',
    'final3_comp1',
    'Final 3 Part 1 result: {winner} wins and advances directly to Part 3! The other two players will compete in Part 2. 🏆'
  ),
  feed(
    'final3.part1-minigame',
    'final3_comp1_minigame',
    'Interactive Final 3 Part 1 competition',
    'game',
    'minor',
    undefined,
    'Gameplay screen; no feed line'
  ),
  feed(
    'final3.part2-start',
    'final3_comp2',
    'Final 3 Part 2 is underway! The remaining two players battle to join the Part 1 winner in Part 3. 🏁'
  ),
  feed(
    'final3.part2-result',
    'final3_comp2',
    'Final 3 Part 2 result: {winner} wins and advances to face the Part 1 winner in Part 3! 🏆'
  ),
  feed(
    'final3.part2-minigame',
    'final3_comp2_minigame',
    'Interactive Final 3 Part 2 competition',
    'game',
    'minor',
    undefined,
    'Gameplay screen; no feed line'
  ),
  feed(
    'final3.part3-start',
    'final3_comp3',
    'Final 3 Part 3 is underway! {first} (Part 1 winner) vs {second} (Part 2 winner) — the winner becomes the Final Leader of the House! 🏁'
  ),
  feed(
    'final3.part3-result',
    'final3_comp3',
    'Final 3 Part 3: {winner} wins and is crowned the Final Leader of the House! 👑'
  ),
  feed(
    'final3.part3-human-decision',
    'final3_comp3',
    '{winner}, you must now eliminate either {nominees} to set the Final 2. 🎯'
  ),
  feed(
    'final3.part3-minigame',
    'final3_comp3_minigame',
    'Interactive Final 3 Part 3 competition',
    'game',
    'minor',
    undefined,
    'Gameplay screen; no feed line'
  ),
  card(
    'card.final-decision',
    'final3_decision',
    'Final LOH Decision',
    'One finalist will be eliminated.',
    'final_hoh'
  ),
  card(
    'card.jury-announcement',
    'jury_announcement',
    'Tribunal Votes',
    'The finalists will face the Tribunal.',
    'jury'
  ),
  feed(
    'jury.cinematic',
    'jury_cinematic',
    'The Tribunal prepares to crown a winner.',
    'game',
    'critical',
    'jury'
  ),
  card('card.jury', 'jury', 'Tribunal Votes', 'The Tribunal decides the winner.', 'jury'),
]

const BY_ID = new Map(BROADCAST_TEMPLATE_CATALOG.map((template) => [template.id, template]))

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileTemplate(text: string): RegExp {
  const parts = text.split(/\{[^}]+\}/g).map(escapeRegex)
  return new RegExp(`^${parts.join('(.+?)')}$`, 'i')
}

export function getBroadcastTemplate(id: string): BroadcastTemplate | undefined {
  return BY_ID.get(id)
}

export function getBroadcastTemplatesForPhase(phase: Phase): readonly BroadcastTemplate[] {
  return BROADCAST_TEMPLATE_CATALOG.filter((template) => template.phase === phase)
}

/** Find the authored source for a major announcement in the active phase. */
export function getBroadcastTemplateForMajor(
  major: string,
  phase?: Phase
): BroadcastTemplate | undefined {
  const matches = BROADCAST_TEMPLATE_CATALOG.filter((template) => template.major === major)
  return (
    (phase == null ? undefined : matches.find((template) => template.phase === phase)) ??
    matches[0]
  )
}

export function matchesBroadcastCampaign(
  template: Pick<BroadcastTemplate, 'campaign'>,
  campaign: BroadcastCampaign | 'all'
): boolean {
  if (campaign === 'depression_shock') return template.campaign === 'depression_shock'
  return campaign === 'all' || !template.campaign || template.campaign === campaign
}

export function getDefaultBroadcastOrder(template: BroadcastTemplate): number {
  const phaseTemplates = getBroadcastTemplatesForPhase(template.phase)
  const index = phaseTemplates.findIndex((candidate) => candidate.id === template.id)
  return (Math.max(0, index) + 1) * 100
}

export function matchBroadcastTemplate(
  text: string,
  phase?: Phase,
  explicitId?: unknown
): BroadcastTemplateMatch | null {
  if (typeof explicitId === 'string') {
    const explicit = getBroadcastTemplate(explicitId)
    if (explicit) {
      const match = text.match(compileTemplate(explicit.text))
      return { template: explicit, variables: match?.slice(1) ?? [] }
    }
  }
  const candidates = BROADCAST_TEMPLATE_CATALOG.filter(
    (template) => template.kind === 'feed' && (!phase || template.phase === phase)
  )
  for (const template of candidates) {
    const match = text.match(compileTemplate(template.text))
    if (match) return { template, variables: match.slice(1) }
  }
  if (phase) return matchBroadcastTemplate(text, undefined, explicitId)
  return null
}

export function renderBroadcastTemplate(text: string, variables: readonly string[]): string {
  let index = 0
  return text.replace(/\{[^}]+\}/g, () => variables[index++] ?? '')
}

export function getPhaseCardTemplate(phase: Phase, major: string): BroadcastTemplate | undefined {
  return BROADCAST_TEMPLATE_CATALOG.find(
    (template) =>
      template.kind === 'phase_card' && template.phase === phase && template.major === major
  )
}
