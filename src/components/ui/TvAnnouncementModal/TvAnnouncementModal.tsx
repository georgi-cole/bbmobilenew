import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { VOX_POPULI_INFO_SUMMARY } from '../../../rules/voxPopuliGuide'
import './TvAnnouncementModal.css'

// ─── Phase copy ───────────────────────────────────────────────────────────────

interface PhaseCopy {
  icon: string
  label: string
  category: string
  body: string
  /** Optional shock-specific detail paragraph appended after `body`. */
  shockDetail?: string
  rulesRoute?: string
}

const PHASE_COPY: Record<string, PhaseCopy> = {
  season_start: {
    icon: '🏠',
    // i18n-ignore: Legacy phase-copy registry stores canonical English copy
    label: 'SEASON START',
    category: 'Game Event',
    // i18n-ignore: Legacy phase-copy registry stores canonical English copy
    body: 'The house opens and the season rules are introduced before Day 1 begins.',
  },
  week_start: {
    icon: '📅',
    label: 'NEW DAY',
    category: 'Game Event',
    body: 'A new day begins in The Big Eye. Players reset their social games and strategise before the Leader of the House competition. Alliances shift, targets are reconsidered, and the game dynamics evolve.',
  },
  nomination_ceremony: {
    icon: '🎯',
    label: 'NOMINATIONS',
    category: 'Ceremony',
    body: 'The Leader of the House gathers all players and nominates two players for potential elimination. Nominees have the chance to save themselves by winning the Power of Safety. Every speech and every alliance is tested in this moment.',
  },
  veto_competition: {
    icon: '🏆',
    label: 'SAFETY COMP',
    category: 'Competition',
    body: 'Six players compete for the Power of Safety — the most powerful item in the game. The winner decides whether to keep the nominations the same or pull a nominee from the list, forcing the LOH to name a backup nominee.',
  },
  veto_ceremony: {
    icon: '🏅',
    label: 'SAFETY CEREMONY',
    category: 'Ceremony',
    body: 'The Power of Safety holder announces their decision: use the Safety to save a nominee, or keep the nominations unchanged. When used, the LOH must immediately name a backup nominee — and they cannot choose the outgoing LOH.',
  },
  live_eviction: {
    icon: '📺',
    label: 'LIVE ELIMINATION',
    category: 'Live Event',
    body: 'The house votes live to eliminate one of the current nominees. All eligible voters cast their ballots privately. The nominee with the most votes is eliminated and leaves the house immediately to join the Tribunal (or go home, pre-Tribunal). In a tie, the Leader of the House casts the deciding vote.',
  },
  final4: {
    icon: '4️⃣',
    label: 'FINAL 4',
    category: 'Endgame',
    body: 'Only four players remain. The stakes are at their highest — every competition, every vote, every conversation could determine who makes it to the Finale. At this stage there is no longer a traditional safety ceremony; the POS holder is the sole vote to eliminate.',
  },
  final3: {
    icon: '3️⃣',
    label: 'THE FINALE',
    category: 'Endgame',
    body: 'The Finale has arrived. Three players remain, and they now compete in the legendary three-part Leader of the House competition. Part 1 is an endurance battle. Part 2 tests skill and memory. The winners of Parts 1 and 2 face off in Part 3, and the winner becomes the Final Leader of the House.',
  },
  final_hoh: {
    icon: '👑',
    label: 'FINAL LOH',
    category: 'Endgame',
    body: 'The Final Leader of the House holds the most consequential power in the game. They alone decide who sits beside them in the Final 2 — and who is sent to the Tribunal just one step from the prize. This single choice often defines legacies.',
  },
  vox_populi: {
    icon: '🗣️',
    label: 'VOX POPULI',
    category: 'Season Expansion',
    body: VOX_POPULI_INFO_SUMMARY,
    shockDetail: 'Open the full guide for the daily loop, ballot ties, Safety backups, doubles, and the audience-led finale.',
    rulesRoute: '/vox-populi-rules',
  },
  vox_immunity_comp: {
    icon: '🛡️',
    label: 'IMMUNITY COMPETITION',
    category: 'Vox Populi',
    body:
      'Every remaining housemate may compete. Today’s winner earns immunity and cannot be nominated. The last-place finisher is placed directly on the block before the secret nominations are counted.',
    shockDetail:
      'The Final 4 reverses the balance: nobody earns immunity, last place starts on the block, and the other three each cast one secret vote.',
  },
  vox_final4_immunity_comp: {
    icon: '4️⃣',
    label: 'FINAL 4 COMPETITION',
    category: 'Vox Populi Endgame',
    body:
      'Four housemates remain. Nobody earns immunity; the last-place finisher begins on the block.',
    shockDetail:
      'The other three housemates each cast one secret nomination vote. The highest total joins last place on the block; a tie expands it.',
  },
  vox_nominations: {
    icon: '🗳️',
    label: 'SECRET NOMINATIONS',
    category: 'Vox Populi',
    body:
      'Housemates enter the Confessional one at a time and privately name two eligible people. They cannot nominate themselves or the immunity winner.',
    shockDetail:
      'The two highest nomination totals are placed on the block. If players are tied at the cutoff, every tied player is nominated. At Final 4, the other three cast one vote each and the highest total joins the last-place nominee.',
  },
  vox_safety_ceremony: {
    icon: '🎭',
    label: 'POWER OF SAFETY',
    category: 'Vox Populi',
    body:
      'The Safety holder may keep the block unchanged or save one current nominee. If the winner is on the block, they automatically save themself.',
    shockDetail:
      'After a save, the next-highest housemate in the original secret-nomination totals joins the block only when fewer than two nominees remain. On an eligible Double Elimination day, the ranking restores the block only when fewer than three nominees remain. If enough nominees are still in danger, no backup is added.',
  },
  vox_public_vote: {
    icon: '📡',
    label: 'THE PUBLIC DECIDES',
    category: 'Live Audience Vote',
    body:
      'The nominees face a public vote to eliminate. The nominee with the highest share of the audience vote leaves the house. Housemates do not vote and there is no Leader of the House tiebreak.',
    shockDetail:
      'Public Mode can show changing approval, momentum, and hints for building popularity, but it never saves a nominee in Vox Populi. On an eligible Double Elimination day, at least three nominees must face the vote and the two highest audience totals are eliminated.',
  },
  vox_final3: {
    icon: '🏁',
    label: 'FINAL 3',
    category: 'Vox Populi Finale',
    body:
      'The last three housemates compete for final immunity. The winner is guaranteed a place in the Final 2.',
    shockDetail:
      'The audience votes to eliminate one of the other two housemates. Once the Final 2 is formed, the audience votes again—this time to crown the season winner. There is no Tribunal and no sole housemate vote.',
  },
  ad_break_eviction_auto: {
    icon: '📺',
    label: 'SHORT BREAK',
    category: 'Broadcast',
    body: "Don't change the channel, a new Day is about to begin right after a short break.",
  },
  ad_break_pos_decision_auto: {
    icon: '📺',
    label: 'SHORT BREAK',
    category: 'Broadcast',
    body: 'Is the Power of Safety holder going to use the power to change the course of the game? Find out right after this short break!',
  },
  ad_break_final_safety_decision_auto: {
    icon: '📺',
    label: 'SHORT BREAK',
    category: 'Broadcast',
    body: 'The final safety winner now has the deciding vote to evict. Find out who is going to be eliminated just a step before the finale. Stay with us.',
  },
  ad_break_final_loh_decision_auto: {
    icon: '📺',
    label: 'SHORT BREAK',
    category: 'Broadcast',
    body: 'The final leader of the house has to make a very important decision that might cost them the victory. Who will they choose? Find out right after the break.',
  },
  jury: {
    icon: '⚖️',
    label: 'TRIBUNAL VOTES',
    category: 'Tribunal Phase',
    body: 'The Tribunal — made up of the last eliminated players — casts their votes to award the grand prize. Each judge votes for the finalist they believe most deserves to win based on game play, social game, and competition performance. The finalist with the most Tribunal votes is crowned the winner of The Big Eye.',
  },
  battle_back: {
    icon: '🔥',
    label: 'BACK 2 THE GAME',
    category: 'Twist',
    body: 'A Back 2 the Game shock has been activated. Recently eliminated players will face off in a special competition for a chance to re-enter The Big Eye. Alliances can shift instantly — and the returning player gets a fresh shot at the prize.',
    shockDetail:
      'Eliminated players compete head-to-head in a specially designed challenge. Only one winner earns the right to return. Upon re-entry, the returning player is immediately eligible for all competitions, nominations, and votes — existing alliances must adapt at once.',
  },
  battle_back_shock: {
    icon: '🔥',
    label: 'SHOCK TWIST',
    category: 'Twist',
    body: 'Back 2 the Game has been activated. One of the recently eliminated players now has a chance to fight their way back into the house.',
    shockDetail:
      'This is not a standard elimination week. The Back 2 the Game shock changes the trajectory of the game by giving a previously eliminated player a route back in. All current alliance plans, targets, and strategies must account for a possible new returnee.',
  },
  battle_back_rules: {
    icon: '📜',
    label: 'BACK 2 THE GAME RULES',
    category: 'Twist',
    body: 'The Back 2 the Game field is set. Recently eliminated players will compete head-to-head, and only one winner can earn their return to the game.',
    shockDetail:
      'Only Tribunal members who have been eliminated are eligible to compete. Each player faces off in a single-elimination bracket or direct challenge format chosen by Big Eye. The winner earns immediate, full re-entry: eligible for all competitions, nominations, and votes from the next phase onward.',
  },
  battle_back_challenge: {
    icon: '🏆',
    label: 'BACK 2 THE GAME CHALLENGE',
    category: 'Competition',
    body: 'The Back 2 the Game challenge is about to begin. Watch the showdown play out to see which eliminated player can claw their way back into The Big Eye.',
    shockDetail:
      'The challenge is live and in progress. Eliminated players are competing for the right to re-enter the house. The winner will be announced shortly — and once re-entered, they are immediately a full player again with no special protections or restrictions.',
  },
  double_eviction: {
    icon: '⚡',
    label: 'DOUBLE ELIMINATION',
    category: 'Twist',
    body: "A Double Elimination has been triggered! Tonight's Leader of the House must nominate THREE players for elimination. After a Power of Safety competition and ceremony, the remaining players vote to eliminate TWO of those nominees in a single live show. Alliances shatter, plans collapse, and the game changes forever in one night.",
    shockDetail:
      'The Double Elimination runs as a compressed, fast-paced week: three nominees are put up, a Safety competition determines who can be saved, and after the Safety Ceremony the house votes out two players in one sitting. Strategic timelines are cut short — every conversation and every alliance decision must happen immediately.',
  },
  cupid_arrow: {
    icon: '🏹',
    label: "CUPID HAS CHOSEN",
    category: 'Season Expansion',
    body: 'Cupid has matched every housemate with a partner. For now, you are not playing alone: every pair shares one fate inside The Big Eye house.',
    shockDetail:
      'Each pair deliberates together and casts one joint ballot worth two votes. The partner of the Power of Safety winner is protected from replacement nomination. Secret Missions and conflicting shocks wait beyond the spell. Four eliminated pairs will break Cupid’s hold.',
  },
  cupid_arrow_broken: {
    icon: '💔',
    label: 'THE LAST ARROW BREAKS',
    category: 'Season Expansion',
    body: 'Four pairs have fallen. The hearts fracture, Cupid’s final arrow dissolves, and the winged matchmaker leaves The Big Eye house. The rose-lit spell recedes and the original game returns.',
    shockDetail:
      'Every survivor now competes, nominates, votes, and faces elimination alone. Former partners keep the relationship history they created: devotion may survive, but arguments, betrayals, and incompatible games can turn the old bond into a scar.',
  },
  democracia: {
    icon: '🗳️',
    label: 'DEMOCRACIA',
    category: 'Shock',
    body: 'Democracia has been activated. Instead of competing for power, the house will elect the next Leader of the House by secret vote.',
    shockDetail:
      'Every active player becomes part of the election. If there is a tie for first place, the tied candidates stay in contention and the remaining eligible houseguests revote until the result is resolved.',
  },
  twist: {
    icon: '🌀',
    label: 'SHOCK',
    category: 'Shock',
    body: 'The Big Eye never plays by the same rules twice. A shock has been introduced that could change the course of the game. Pay close attention — nothing is certain, and the players may need to adapt quickly to survive.',
    shockDetail:
      'A new shock condition is now in effect. The Big Eye may introduce effects that alter nominations, safety, voting, or the structure of the week at any moment. Watch how players react — adaptability is the key to survival.',
  },
  vip_veto: {
    icon: '👑',
    label: 'DOUBLE TROUBLE',
    category: 'Shock',
    body: 'A special power has been activated — Double Trouble! The holder of the Power of Safety may use it twice during this Safety Ceremony, saving up to two different nominees.',
    shockDetail:
      'Each use forces the Leader of the House to immediately name a replacement nominee. The holder decides independently for each use whether to deploy the power. The power expires at the end of this ceremony and cannot be carried forward.',
  },
  diamond_pov: {
    icon: '😇',
    label: 'HALO EXCHANGE',
    category: 'Shock',
    body: 'A special power has been activated — the Halo Exchange! The holder of this enhanced Power of Safety has the unique authority to name the backup nominee directly.',
    shockDetail:
      'When the Halo Exchange is used, the normal LOH naming rights are bypassed entirely. The holder may choose any eligible non-nominee, non-LOH player as the replacement. This shifts strategic power away from the LOH at the most critical moment of the week.',
  },
  coup_detat: {
    icon: '⚡',
    label: 'DETOX',
    category: 'Shock',
    body: 'A special power has been activated — the Detox! Both current nominees have been immediately cleared from the block. The holder must now name two entirely new nominees.',
    shockDetail:
      'The Detox wipes the existing nominations and forces the holder to rebuild the block from scratch. The holder is not eligible to be nominated, but the outgoing Leader of the House is. A new Power of Safety competition proceeds with the replacement nominees in place.',
  },
  spotlight_veto: {
    icon: '✨',
    label: 'FORCE MAJEURE',
    category: 'Shock',
    body: 'A special power has been activated — Force Majeure! The Power of Safety holder is required to use the power this ceremony — it cannot be kept unplayed.',
    shockDetail:
      'Regardless of the holder\'s strategic preference, the Power of Safety must be used this ceremony. A replacement nominee must be named by the LOH immediately. This force-use removes the option of "keeping nominations the same" and dramatically increases the pressure on both the holder and the LOH.',
  },
  loh_comp_announcement: {
    icon: '🏆',
    label: 'LOH COMPETITION',
    category: 'Competition',
    body: 'The Leader of the House competition is about to begin. Every eligible player is fighting for the most powerful position in the game. The winner becomes the new Leader of the House and gains the authority to nominate two of their fellow players for elimination. Control is up for winning — who will reign supreme today?',
  },
  pos_comp_announcement: {
    icon: '🎭',
    label: 'POWER OF SAFETY',
    category: 'Competition',
    body: "It is time for the Power of Safety competition. Players will battle for the most powerful item in the game. The winner holds the sole power to change the nominations and potentially rewrite the day's outcome entirely.",
  },
}

PHASE_COPY.cupid_arrow.shockDetail =
  'When one partner wins power, both partners share it. When danger reaches one partner, it reaches both. Each pair makes one eviction choice together, worth two votes. Once four pairs have left the house, Cupid’s spell breaks and everyone returns to an individual game.'
PHASE_COPY.cupid_arrow.shockDetail =
  'Partners deliberate together and cast one joint ballot worth two votes. Power won by one partner is shared by both, and the partner of the Power of Safety winner is protected from replacement nomination. If danger reaches one partner, both are exposed; pair eliminations resolve together. Protect your bond: the Big Eye is watching.'
PHASE_COPY.cupid_arrow_broken.body =
  'Four pairs have fallen. Cupid’s spell has ended, the bonds are gone, and the house is no longer divided into pairs.'
PHASE_COPY.cupid_arrow_broken.shockDetail =
  'Every survivor now competes, nominates, votes, and faces elimination alone. The connection each former pair built may still shape the game—but it no longer controls their fate.'

const FALLBACK_COPY: PhaseCopy = {
  icon: '📢',
  label: 'ANNOUNCEMENT',
  category: 'The Big Eye',
  body: 'A significant moment has occurred in The Big Eye. The players — and you — must decide what comes next.',
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface TvAnnouncementModalProps {
  announcementKey: string
  open: boolean
  onClose: () => void
}

/**
 * TvAnnouncementModal — fullscreen phase-info modal.
 *
 * - Closes on backdrop click or ESC key.
 * - Moves focus to the card on open; full focus trap is not implemented.
 */
export default function TvAnnouncementModal({
  announcementKey,
  open,
  onClose,
}: TvAnnouncementModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  // Keep a ref to onClose so the fast-path always calls the latest callback
  // without the effect re-running on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Fast-path: auto-close immediately when animations are disabled.
  useEffect(() => {
    if (!open) return
    if (document.body.classList.contains('no-animations')) {
      onCloseRef.current()
    }
  }, [open])

  // ESC to close
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Focus the card when opened
  useEffect(() => {
    if (open) cardRef.current?.focus()
  }, [open])

  if (!open) return null

  const sourceCopy = PHASE_COPY[announcementKey] ?? FALLBACK_COPY
  const normalizeHubCopy = (value: string) => value.replace(/\bhouse\b/gi, 'hub')
  const copy = {
    ...sourceCopy,
    body: normalizeHubCopy(sourceCopy.body),
    shockDetail: sourceCopy.shockDetail
      ? normalizeHubCopy(sourceCopy.shockDetail)
      : undefined,
  }

  return createPortal(
    <div
      className="tv-ann-modal__backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={[
          'tv-ann-modal__card',
          announcementKey === 'cupid_arrow' ? 'tv-ann-modal__card--cupid' : '',
          announcementKey === 'cupid_arrow_broken' ? 'tv-ann-modal__card--cupid-broken' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={`Phase info: ${copy.label}`}
        tabIndex={-1}
        ref={cardRef}
      >
        <button className="tv-ann-modal__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="tv-ann-modal__header">
          <span className="tv-ann-modal__icon" aria-hidden="true">
            {copy.icon}
          </span>
          <h2 className="tv-ann-modal__title">{copy.label}</h2>
        </div>
        <span className="tv-ann-modal__badge">{copy.category}</span>

        <hr className="tv-ann-modal__divider" />

        <div className="tv-ann-modal__body">
          {copy.body.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          {copy.shockDetail && <p className="tv-ann-modal__shock-detail">{copy.shockDetail}</p>}
          {copy.rulesRoute && (
            <button
              type="button"
              className="tv-ann-modal__rules-link"
              onClick={() => {
                window.location.hash = `#${copy.rulesRoute!}`
              }}
            >
              Read Vox Populi rules
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
