export interface BroadcastAnnouncementPresentation {
  title: string
  subtitle: string
  isLive: boolean
  /** ms until auto-dismiss; null = manual dismiss only */
  autoDismissMs: number | null
}

export interface BroadcastPresentationRule {
  /** Preserve TvZone's legacy explicit-major whitelist semantics. */
  eventMajor?: boolean
  /** Fallback card copy for explicit/legacy major events without authored event metadata. */
  announcement?: BroadcastAnnouncementPresentation
  /** Fullscreen stinger → Faux TV card → spotlight sequence. */
  shock?: boolean
  /** The central Play action may continue after dismissing this card. */
  playThrough?: boolean
}

const liveCard = (title: string, subtitle: string): BroadcastAnnouncementPresentation => ({
  title,
  subtitle,
  isLive: true,
  autoDismissMs: null,
})

/**
 * Declarative Faux TV presentation metadata keyed by the same `major` values
 * used by broadcast templates and persisted TvEvents.
 *
 * This registry intentionally does not duplicate the P0 editorial contract:
 * editorial metadata still owns log_only/ambient/foreground/interrupt routing,
 * optional budgets and Force-to-TV precedence. These rules only describe how a
 * recognised major announcement is rendered once it reaches the Faux TV.
 *
 * `eventMajor` preserves the exact legacy TvZone whitelist. Some entries carry
 * announcement/shock/play-through metadata without being accepted as generic
 * event majors because they are reached only through bespoke or managed flows.
 */
export const BROADCAST_PRESENTATION_REGISTRY: Readonly<Record<string, BroadcastPresentationRule>> =
  {
    custom_broadcast: {
      eventMajor: true,
      announcement: liveCard('BIG EYE BROADCAST', ''),
    },
    custom_major: {
      eventMajor: true,
      announcement: liveCard('BIG EYE BROADCAST', ''),
    },
    custom_critical: {
      eventMajor: true,
      shock: true,
      announcement: liveCard('SHOCK ANNOUNCEMENT', ''),
    },
    depression_shock_start: {
      eventMajor: true,
      shock: true,
      announcement: liveCard(
        'Depression Shock',
        'A storm has settled over the hub. The rain will not let up, and a deep melancholy is changing how the players think, speak, and play.'
      ),
    },
    depression_shock_day_2: {
      eventMajor: true,
      shock: true,
      announcement: liveCard(
        'The colour drains away',
        'The storm has deepened. Today the hub loses most of its colour. Every familiar room feels colder, flatter, and farther away.'
      ),
    },
    depression_shock_chocolates: {
      eventMajor: true,
      announcement: liveCard(
        'A small comfort',
        'The Big Eye has left chocolates for everyone. Wrappers open in the quiet, but the rain keeps speaking louder. 🍫'
      ),
    },
    depression_shock_melancholy: {
      eventMajor: true,
      announcement: liveCard(
        'Under the weather',
        'The storm continues to press against every room and every conversation.'
      ),
    },
    depression_shock_end: {
      announcement: liveCard(
        'The sun returns',
        'Morning light breaks through the clouds. Colour returns, familiar faces reappear, and the hub finally exhales.'
      ),
    },
    nomination_ceremony: {
      eventMajor: true,
      announcement: liveCard('Nomination Ceremony', 'Two players are nominated for elimination.'),
    },
    veto_ceremony: {
      eventMajor: true,
      announcement: liveCard('Safety Ceremony', 'Will the Power of Safety be used?'),
    },
    live_eviction: {
      eventMajor: true,
      announcement: liveCard(
        'Live Elimination',
        'The hub has spoken. One player’s journey ends tonight.'
      ),
    },
    final4: {
      eventMajor: true,
      announcement: liveCard('Final 4 — Safety Ceremony', 'Only four players remain.'),
    },
    final3_announcement: {
      eventMajor: true,
      announcement: liveCard(
        'The Finale',
        'Three players remain — the three-part Final LOH begins.'
      ),
    },
    final_hoh: {
      eventMajor: true,
      announcement: liveCard('Final LOH Decision', 'The most powerful decision of the game.'),
    },
    jury: {
      eventMajor: true,
      announcement: liveCard('Tribunal Votes', 'The Tribunal decides the winner.'),
    },
    battle_back: {
      eventMajor: true,
      shock: true,
      announcement: liveCard(
        'Back 2 the Game',
        'Tribunal members will face off. Only one can win the right to return to the hub. Press Play to begin the showdown.'
      ),
    },
    battle_back_shock: { shock: true },
    battle_back_rules: { shock: true },
    battle_back_challenge: { shock: true },
    double_eviction: {
      eventMajor: true,
      shock: true,
      playThrough: true,
      announcement: liveCard(
        'Double Elimination!',
        'Tonight the LOH nominates three. Two will be eliminated.'
      ),
    },
    vox_double_eviction: {
      eventMajor: true,
      shock: true,
      playThrough: true,
      announcement: liveCard(
        'Double Elimination!',
        'At least three nominees face the public. The audience will eliminate two players.'
      ),
    },
    cupid_arrow: {
      eventMajor: true,
      shock: true,
      announcement: liveCard(
        "Cupid's Arrow",
        'The hub is bound into eight pairs. Every triumph, vote, danger, and fall is shared.'
      ),
    },
    cupid_arrow_broken: {
      eventMajor: true,
      shock: true,
      announcement: liveCard(
        "Cupid's Spell Is Broken",
        'Four pairs have fallen. Cupid leaves the hub, and every survivor now plays alone.'
      ),
    },
    vox_populi: {
      eventMajor: true,
      shock: true,
      playThrough: true,
      announcement: liveCard(
        'VOX POPULI',
        'Players nominate in secret. The audience decides who leaves; Public Mode reveals the pulse.'
      ),
    },
    vox_immunity_comp: {
      announcement: liveCard(
        'Immunity Competition',
        'The winner is safe today. The last-place finisher goes straight onto the block.'
      ),
    },
    vox_final4_immunity_comp: {
      announcement: liveCard(
        'Final 4 Competition',
        'No immunity is awarded today. Last place begins on the block; the other three each cast one secret vote.'
      ),
    },
    vox_nominations: {
      announcement: liveCard(
        'Secret Nominations',
        'Every player privately names two people. Cutoff ties expand the block.'
      ),
    },
    vox_safety_ceremony: {
      announcement: liveCard(
        'Power of Safety',
        'The holder may save a nominee. The original secret-ballot ranking decides whether a backup is needed.'
      ),
    },
    vox_public_vote: {
      announcement: liveCard(
        'The Public Decides',
        'The audience is voting to eliminate. The players do not vote.'
      ),
    },
    vox_final3: {
      playThrough: true,
      announcement: liveCard(
        'Final 3',
        'One player will win immunity. The audience will decide third place.'
      ),
    },
    vox_populi_final_three_vote: {
      playThrough: true,
      announcement: liveCard(
        'The Final Three Verdict',
        'One finalist is immune. The audience is about to end one of the other two journeys.'
      ),
    },
    vox_populi_final_two: {
      playThrough: true,
      announcement: liveCard(
        'The Final Two',
        'Two journeys remain. The audience will choose the champion.'
      ),
    },
    vox_populi_final_vote: {
      announcement: liveCard(
        'The Final Audience Vote',
        'The last vote of the season is live. One of these finalists will win The Big Eye.'
      ),
    },
    vox_final3_interlude: {
      playThrough: true,
      announcement: liveCard(
        'The Final Three',
        'The hub falls quiet. Every bond, promise, and rivalry now carries final-night weight.'
      ),
    },
    vox_final3_result: {
      playThrough: true,
      announcement: liveCard(
        'Final Three Result',
        'The final immunity journey takes another turn.'
      ),
    },
    vox_populi_finale_ready: {
      announcement: liveCard(
        'Ready for the Finale?',
        'The final two have made their case. Press Play to open the final audience vote.'
      ),
    },
    vip_veto: {
      eventMajor: true,
      shock: true,
      playThrough: true,
      announcement: liveCard(
        'Double Trouble!',
        'The holder may use the power twice this ceremony. 👑'
      ),
    },
    diamond_pov: {
      eventMajor: true,
      shock: true,
      playThrough: true,
      announcement: liveCard('Halo Exchange!', 'The holder may name the backup nominee. 😇'),
    },
    coup_detat: {
      eventMajor: true,
      shock: true,
      playThrough: true,
      announcement: liveCard(
        'Detox!',
        'Both nominees cleared. Holder names two backup nominees. ⚡'
      ),
    },
    spotlight_veto: {
      eventMajor: true,
      shock: true,
      playThrough: true,
      announcement: liveCard(
        'Force Majeure!',
        'The holder is forced to use the power this ceremony. ✨'
      ),
    },
    democracia: {
      eventMajor: true,
      shock: true,
      playThrough: true,
      announcement: liveCard('DEMOCRACIA!', 'The hub will elect its new leader by secret vote.'),
    },
    tribunal_phase: {
      announcement: liveCard(
        'Welcome to the Tribunal',
        'The game is over for you, but your final vote will decide who deserves the crown.'
      ),
    },
    twist: {
      eventMajor: true,
      shock: true,
      announcement: liveCard('Shock Alert!', 'The Big Eye has a surprise.'),
    },
    loh_comp_announcement: {
      eventMajor: true,
      announcement: liveCard(
        'LOH Competition',
        'Control is up for winning — who will become Leader of the Hub?'
      ),
    },
    pos_comp_announcement: {
      eventMajor: true,
      announcement: liveCard(
        'Power of Safety',
        'The winner can protect a nominee and force the block to change.'
      ),
    },
  }

export function getBroadcastPresentationRule(
  key: string | null | undefined
): BroadcastPresentationRule | undefined {
  return key ? BROADCAST_PRESENTATION_REGISTRY[key] : undefined
}

export function getBroadcastAnnouncementPresentation(
  key: string | null | undefined
): BroadcastAnnouncementPresentation | undefined {
  return getBroadcastPresentationRule(key)?.announcement
}

export function isRecognizedBroadcastMajorKey(key: unknown): key is string {
  return typeof key === 'string' && getBroadcastPresentationRule(key)?.eventMajor === true
}

export function isBroadcastShockAnnouncementKey(key: string | null | undefined): boolean {
  return getBroadcastPresentationRule(key)?.shock === true
}

export function isBroadcastPlayThroughAnnouncementKey(key: string | null | undefined): boolean {
  return getBroadcastPresentationRule(key)?.playThrough === true
}
