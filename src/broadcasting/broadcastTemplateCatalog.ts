import type { BroadcastLevel, Phase, TvEvent } from '../types'

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
  note?: string
}

export interface BroadcastTemplateMatch {
  template: BroadcastTemplate
  variables: string[]
}

const feed = (
  id: string,
  phase: Phase,
  text: string,
  type: TvEvent['type'] = 'game',
  level: BroadcastLevel = 'minor',
  major?: string,
  note?: string,
  forceOnTv = true
): BroadcastTemplate => ({ id, phase, kind: 'feed', text, type, level, major, forceOnTv, note })

const card = (
  id: string,
  phase: Phase,
  title: string,
  text: string,
  major: string,
  note?: string,
  level: BroadcastLevel = 'major'
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
  feed('season.welcome', 'season_start', 'Welcome to The Big Eye house! 🏠 Season {season} is about to begin.', 'game', 'minor', undefined, undefined, true),
  feed('season.public-mode-rule', 'season_start', '[Rules] Public mode: {status}'),
  feed(
    'season.vox-populi-intro',
    'season_start',
    'VOX POPULI is now in force. Housemates nominate in secret, the audience decides who leaves, and Public Mode reveals the pulse without changing the official result.',
    'twist',
    'critical',
    'vox_populi',
    'Vox Populi seasons only'
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
  feed('week.day-start', 'week_start', 'Day {day} has begun. Get ready.', 'game', 'minor', undefined, undefined, true),
  card('card.loh', 'loh_comp_announcement', 'LOH Competition', 'Power is up for grabs — who will become Leader of the House?', 'loh_comp_announcement'),
  card('card.democracia', 'loh_comp_announcement', 'DEMOCRACIA!', 'The house will elect the new Leader of the House by secret vote.', 'democracia', 'Democracia branch', 'critical'),
  card('card.vox-immunity', 'loh_comp_announcement', 'Immunity Competition', 'One housemate can earn safety from the public vote.', 'vox_immunity_comp', 'Vox Populi branch'),
  card('card.vox-final4-competition', 'loh_comp_announcement', 'Final 4 Competition', 'No immunity is awarded today. Last place begins on the block; the other three each cast one secret vote.', 'vox_final4_immunity_comp', 'Vox Populi Final 4 branch'),
  feed('loh.competition-start', 'loh_comp', 'The Leader of the House competition has begun! 🏆 Who will win power today?'),
  feed('loh.democracia-vote-start', 'loh_comp', "🗳️ Today's Leader of the House will be chosen by popular vote! Cast your votes now.", 'game', 'major', 'democracia'),
  feed('loh.winner', 'loh_results', '{winner} has won Leader of the House! 👑'),
  feed('loh.cupid-winners', 'loh_results', "{winner} won Leader of the House, making {partner} co-LOH under Cupid's Arrow! 👑💘", 'game', 'minor', undefined, "Cupid's Arrow branch"),
  feed('loh.vox-last-place', 'loh_results', '{player} finished last and is automatically nominated. 🎯', 'game', 'major', 'vox_last_place'),
  card('card.democracia-vote', 'democracia_vote', 'DEMOCRACIA!', 'The house votes by secret ballot to elect the Leader of the House.', 'democracia', undefined, 'critical'),
  feed('democracia.winner', 'democracia_vote', '🗳️ {winner} has been elected Leader of the House! 👑'),
  feed('democracia.public-tiebreak', 'democracia_vote', '🗳️ Even after the ballotage, {players} are still tied! The public will decide by approval rating! 📊'),
  feed('democracia.co-leaders', 'democracia_vote', '🗳️ The votes remain tied! {players} will BOTH serve as co-Leaders of the House! 👑👑'),
  feed('democracia.no-voters', 'democracia_vote', '⚠️ No eligible voters available for ballotage. The winner is decided by chance!'),
  feed('democracia.ballotage', 'democracia_vote', "🗳️ It's a tie between {players}! We go to BALLOTAGE! All other houseguests must revote between the tied candidates. 🗳️"),
  feed('democracia.co-loh-social', 'democracia_results', '{players} are now co-Leaders of the House! 👑👑 Alliances are already forming…', 'social'),
  feed('democracia.social', 'democracia_results', 'Housemates congratulate {winner}. Alliances are already forming… 💬', 'social'),
  feed('democracia.vox-social', 'democracia_results', 'Housemates congratulate {winner} on winning immunity. The secret nomination conversations begin. 💬', 'social'),
  feed('social.loh-congratulations', 'social_1', 'Housemates congratulate {winner}. Alliances are already forming… 💬', 'social'),
  card('card.nominations', 'nominations', 'Nomination Ceremony', 'The Leader of the House will reveal who is in danger.', 'nomination_ceremony'),
  card('card.double-eviction', 'nominations', 'Double Elimination!', 'Tonight, two housemates will leave the game.', 'double_eviction', 'Double Elimination branch'),
  card('card.vox-nominations', 'nominations', 'Secret Nominations', 'Housemates nominate privately in the Confessional.', 'vox_nominations', 'Vox Populi branch'),
  feed('nominations.preparing', 'nominations', '{leader} is preparing the nomination ceremony. 🎯'),
  feed('nominations.vox-confessional', 'nominations', 'Housemates are being called to the Confessional one by one to nominate in secret. 🗳️'),
  feed('nominations.human-prompt', 'nomination_results', "{leader}, it's time to make your nominations. Choose {count} players to nominate. 🎯"),
  feed('nominations.co-loh-prompt', 'nomination_results', '{leader}, as co-Leader of the House, you must nominate one houseguest for elimination. 🎯'),
  feed('nominations.co-loh-pick', 'nomination_results', '{leader} nominates {nominee}. 🎯'),
  feed('nominations.vox-ballot', 'nomination_results', '{player}, cast {ballot} in the Confessional.', 'diary', 'major', 'vox_populi_ballot'),
  feed('nominations.result', 'nomination_results', '{nominees} have been nominated for elimination. 🎯'),
  feed('public-save.intro', 'pre_veto_public_save', "The final list of nominees today will be decided with the public's help."),
  card('card.pos', 'pos_comp_announcement', 'Power of Safety', "It's time for the Power of Safety competition!", 'pos_comp_announcement'),
  feed('pos.competition-start', 'pos_comp', 'The Power of Safety competition is underway! 🎭'),
  feed('pos.winner', 'pos_results', '{winner} has won the Power of Safety! 🎭'),
  card('card.safety', 'pos_ceremony', 'Safety Ceremony', 'The Power of Safety holder will reveal their decision.', 'veto_ceremony'),
  card('card.final4-safety', 'pos_ceremony', 'Final 4 — Safety Ceremony', 'Only four players remain. The Power of Safety holder controls the sole vote.', 'final4', 'Final Four branch'),
  card('card.vox-safety', 'pos_ceremony', 'Safety Ceremony', 'The safety decision can reshape the public vote.', 'vox_safety_ceremony', 'Vox Populi branch'),
  feed('safety.holder', 'pos_ceremony', '{holder} is holding the Safety Ceremony. ⚡'),
  feed('safety.secret-immunity', 'pos_ceremony_results', '{player} may use a secret {days}-day immunity right now to escape the block before the Safety Ceremony concludes. 🛡️'),
  feed('safety.self-save', 'pos_ceremony_results', '{holder} used the Power of Safety and saved themselves! ⚡'),
  feed('safety.save', 'pos_ceremony_results', '{holder} used the Power of Safety to save {nominee}! ⚡'),
  feed('safety.hold', 'pos_ceremony_results', '{holder} chose not to use the Power of Safety. The nominations remain unchanged.'),
  feed('safety.replacement-needed', 'pos_ceremony_results', '{leader} must now name a backup nominee. 🎯'),
  feed('safety.replacement-selecting', 'pos_ceremony_results', '{leader} is selecting a backup nominee...'),
  feed('safety.replacement', 'pos_ceremony_results', '{leader} named {nominee} as the backup nominee. 🎯'),
  feed('safety.force-majeure', 'pos_ceremony_results', '{holder} used Force Majeure and saved themselves! ✨'),
  feed('safety.halo', 'pos_ceremony_results', '{holder} used Halo Exchange and saved themselves! 😇'),
  feed('safety.halo-prompt', 'pos_ceremony_results', '{holder}, will you use Halo Exchange? 😇'),
  feed('safety.double-trouble', 'pos_ceremony_results', '{holder} used Double Trouble and saved themselves! 👑'),
  feed('social.final-pitches', 'social_2', 'The nominees make their final pitches before the vote.', 'social'),
  card('card.live-vote', 'live_vote', 'Live Elimination', 'The house will vote to eliminate.', 'live_eviction'),
  card('card.vox-public-vote', 'live_vote', 'Public Vote', 'The audience decides who leaves.', 'vox_public_vote', 'Vox Populi branch'),
  feed('vote.final-pitches', 'live_vote', 'Housemates give their last plea before voting begins.', 'social'),
  feed('vote.tie-loh', 'eviction_results', "It's a tie between {nominees}! {leader}, as LOH you must break the tie. 🗳️"),
  feed('vote.tie-pos', 'eviction_results', "It's a tie between {nominees}! {holder}, as POS holder, you must break the tie as a special exception. 🗳️"),
  feed('vote.evicted', 'eviction_results', '{evictee}, you have been eliminated from The Big Eye house. 🚪'),
  feed('week.day-end', 'week_end', 'Day {day} has come to an end. A new day begins soon… ✨'),
  card('card.final4', 'final4_eviction', 'Final Four', 'The Power of Safety holder will cast the sole vote.', 'final4'),
  feed('final4.pleas-start', 'final4_eviction', '{holder} asks nominees for their pleas. 🎤'),
  feed('final4.plea', 'final4_eviction', '{nominee}: "{plea}"'),
  card('card.final3', 'final3', 'The Finale', 'Three players remain — the three-part Final LOH begins.', 'final3_announcement'),
  card('card.vox-final3', 'final3', 'Final 3', 'One housemate will win immunity. The audience will decide third place.', 'vox_final3', 'Vox Populi branch'),
  feed('final3.part1-start', 'final3_comp1', 'Final 3 Part 1 is underway! All three players compete for the first leg of the Final LOH. 🏁'),
  feed('final3.part1-result', 'final3_comp1', 'Final 3 Part 1 result: {winner} wins and advances directly to Part 3! The other two players will compete in Part 2. 🏆'),
  feed('final3.part1-minigame', 'final3_comp1_minigame', 'Interactive Final 3 Part 1 competition', 'game', 'minor', undefined, 'Gameplay screen; no feed line'),
  feed('final3.part2-start', 'final3_comp2', 'Final 3 Part 2 is underway! The remaining two players battle to join the Part 1 winner in Part 3. 🏁'),
  feed('final3.part2-result', 'final3_comp2', 'Final 3 Part 2 result: {winner} wins and advances to face the Part 1 winner in Part 3! 🏆'),
  feed('final3.part2-minigame', 'final3_comp2_minigame', 'Interactive Final 3 Part 2 competition', 'game', 'minor', undefined, 'Gameplay screen; no feed line'),
  feed('final3.part3-start', 'final3_comp3', 'Final 3 Part 3 is underway! {first} (Part 1 winner) vs {second} (Part 2 winner) — the winner becomes the Final Leader of the House! 🏁'),
  feed('final3.part3-result', 'final3_comp3', 'Final 3 Part 3: {winner} wins and is crowned the Final Leader of the House! 👑'),
  feed('final3.part3-human-decision', 'final3_comp3', '{winner}, you must now eliminate either {nominees} to set the Final 2. 🎯'),
  feed('final3.part3-minigame', 'final3_comp3_minigame', 'Interactive Final 3 Part 3 competition', 'game', 'minor', undefined, 'Gameplay screen; no feed line'),
  card('card.final-decision', 'final3_decision', 'Final LOH Decision', 'One finalist will be eliminated.', 'final_hoh'),
  card('card.jury-announcement', 'jury_announcement', 'Tribunal Votes', 'The finalists will face the Tribunal.', 'jury'),
  feed('jury.cinematic', 'jury_cinematic', 'The Tribunal prepares to crown a winner.', 'game', 'critical', 'jury'),
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
    (template) => template.kind === 'phase_card' && template.phase === phase && template.major === major
  )
}
