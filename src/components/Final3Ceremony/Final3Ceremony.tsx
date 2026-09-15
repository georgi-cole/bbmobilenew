/**
 * Final3Ceremony — the post-Part-3 ceremony overlay.
 *
 * Triggered when `game.awaitingFinal3Plea` is true and the Final Power holder has been
 * crowned (`game.lohId` is set, phase is 'final3_decision').
 *
 * Sequence:
 *   1. Shared full-screen Final Power holder reveal (skipped if Part 3 spectator already showed it).
 *   2. Plea overlay — nominees make their cases (reuses ChatOverlay).
 *   3. LOH decision:
 *      - Human LOH: TvDecisionModal to choose evictee.
 *      - AI LOH: deterministic auto-pick (seeded RNG, same as advance() AI path).
 *   4. Eviction announcement ChatOverlay.
 *   5. Eviction cinematic — SpotlightEvictionOverlay plays for the evictee.
 *   6. `finalizeFinal3Decision` is dispatched with { hohWinnerId, evicteeId }.
 *   7. `advance()` is dispatched so the game proceeds to the jury phase.
 *
 * Dev log tag: [Final3Ceremony]
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  advance,
  finalizeFinal3Decision,
  setEvictionOverlay,
  clearEvictionOverlay,
} from '../../store/gameSlice'
import ChatOverlay from '../ChatOverlay/ChatOverlay'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import TvDecisionModal from '../TvDecisionModal/TvDecisionModal'
import SpotlightEvictionOverlay from '../Eviction/SpotlightEvictionOverlay'
import FinalPowerHolderReveal from '../FinalPowerBattle/FinalPowerHolderReveal'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import type { ChatLine } from '../ChatOverlay/ChatOverlay'
import type { Player } from '../../types'
import './Final3Ceremony.css'

// ── Types ─────────────────────────────────────────────────────────────────────

type CeremonyStage =
  | 'coronation'
  | 'pleas'
  | 'decision'
  | 'announcement'
  | 'eviction_splash'
  | 'final_two_reveal'
  | 'done'

// ── Constants ────────────────────────────────────────────────────────────────

const DEV_SKIP = import.meta.env.DEV || import.meta.env.CI === 'true'

type DecisionRead = {
  threat: number
  affinity: number
  tags: string[]
  comparison: string
  reason: string
}

function readDecision(
  lohId: string | null,
  nominee: Player,
  relationships: Record<string, Record<string, { affinity: number; tags: string[] }>> | undefined
): DecisionRead {
  const stats = nominee.stats
  const lohWins = stats?.lohWins ?? 0
  const posWins = stats?.posWins ?? 0
  const timesNominated = stats?.timesNominated ?? 0
  const relationship = lohId ? relationships?.[lohId]?.[nominee.id] : undefined
  const affinity = relationship?.affinity ?? 0
  const tags = relationship?.tags ?? []
  const threat = lohWins * 3 + posWins * 2 + Math.min(timesNominated, 3)
  const brokeTrust =
    tags.includes('betrayal') || tags.includes('target') || tags.includes('rivalry')
  const comparison = [
    threat >= 5 ? `${lohWins + posWins} competition wins` : null,
    timesNominated >= 2 ? `survived the block ${timesNominated} times` : null,
    affinity >= 30 ? 'a strong bond with you' : null,
    affinity <= -20 || brokeTrust ? 'unfinished business between you' : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const reason =
    brokeTrust || affinity <= -20
      ? 'our game was never settled'
      : threat >= 5
        ? 'you have built too strong a case to sit beside'
        : timesNominated >= 2
          ? 'you have survived every time the house put you in danger'
          : 'this is the move I can live with'
  return { threat, affinity, tags, comparison, reason }
}

function chooseAiEvictee(
  lohId: string | null,
  nominees: Player[],
  relationships: Record<string, Record<string, { affinity: number; tags: string[] }>> | undefined
): { player: Player; reason: string } | null {
  const ranked = nominees
    .map((player) => {
      const read = readDecision(lohId, player, relationships)
      const relationshipPenalty = read.affinity
      const betrayalBonus = read.tags.includes('betrayal') ? 28 : 0
      const rivalryBonus = read.tags.includes('target') || read.tags.includes('rivalry') ? 14 : 0
      return {
        player,
        read,
        score: read.threat * 5 - relationshipPenalty + betrayalBonus + rivalryBonus,
      }
    })
    .sort(
      (left, right) => right.score - left.score || left.player.id.localeCompare(right.player.id)
    )
  const choice = ranked[0]
  return choice ? { player: choice.player, reason: choice.read.reason } : null
}

function buildPlea(nominee: Player, read: DecisionRead): string {
  const wins = (nominee.stats?.lohWins ?? 0) + (nominee.stats?.posWins ?? 0)
  const timesNominated = nominee.stats?.timesNominated ?? 0
  if (read.affinity >= 35)
    return `We got here because we trusted each other. I hope that still means something.`
  if (wins >= 2)
    return `I've earned ${wins} competition wins. Taking me to the Final Two would let me finish what I came here to do.`
  if (timesNominated >= 2)
    return `I've been nominated ${timesNominated} times. I kept finding a way forward, and I'm not ready for my story to end in third.`
  if (read.tags.includes('alliance'))
    return `We made it this far together. I want to finish this with the person who knows the whole story.`
  return `I know there's no perfect argument for this choice. I kept showing up for this game, and I want one last chance to prove I belong beside you.`
}

function buildPleaResponse(nominee: Player, read: DecisionRead): string {
  const wins = (nominee.stats?.lohWins ?? 0) + (nominee.stats?.posWins ?? 0)
  const timesNominated = nominee.stats?.timesNominated ?? 0
  if (read.affinity >= 35)
    return `I haven't forgotten the bond we built. That's part of why this is so hard.`
  if (
    read.tags.includes('betrayal') ||
    read.tags.includes('target') ||
    read.tags.includes('rivalry')
  )
    return `We haven't always seen the game the same way. I hear you, and I won't pretend those moments didn't matter.`
  if (wins > 0)
    return `You've earned ${wins} competition win${wins === 1 ? '' : 's'}. I know what it took to get here.`
  if (timesNominated > 1)
    return `You've stood on the block ${timesNominated} times. That's a lot of pressure to carry this far.`
  return `I know how much this chance means to you. I'll keep that with me when I make the call.`
}

function thirdPlaceExitLine(player: Player, read: DecisionRead): string {
  const wins = (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0)
  const timesNominated = player.stats?.timesNominated ?? 0
  if (read.affinity >= 35)
    return `${player.name} leaves after a season built on a real bond with the Final Power holder.`
  if (wins >= 2) return `${player.name} leaves as one of the season's fiercest competition players.`
  if (timesNominated >= 2)
    return `${player.name} leaves after surviving the block ${timesNominated} times.`
  return `${player.name}'s story ends one step before the Final 2.`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onPlayAvailabilityChange?: (available: boolean) => void
}

export default function Final3Ceremony({ onPlayAvailabilityChange }: Props) {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)

  const lohId = game.lohId
  const lohPlayer = game.players.find((p) => p.id === lohId) ?? null
  const nominees = game.players.filter((p) => game.nomineeIds.includes(p.id))
  const humanPlayer = game.players.find((p) => p.isUser) ?? null
  const humanIsLoh = !!humanPlayer && humanPlayer.id === lohId
  const decisionReads = useMemo(
    () =>
      Object.fromEntries(
        nominees.map((nominee) => [
          nominee.id,
          readDecision(lohId, nominee, game.strategicRelationships),
        ])
      ),
    [game.strategicRelationships, lohId, nominees]
  )
  const optionDescriptions = useMemo(
    () =>
      Object.fromEntries(
        nominees
          .map((nominee) => [nominee.id, decisionReads[nominee.id]?.comparison] as const)
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
      ),
    [decisionReads, nominees]
  )
  const pleaDialogueLines = useMemo<ChatLine[]>(() => {
    if (!lohPlayer) return []
    const lines: ChatLine[] = [
      {
        id: 'f3c-plea-opening',
        role: 'loh',
        player: lohPlayer,
        text: `Before I decide who joins me in the Final Two, I want to hear from both of you. Tell me what I should remember when I make this call.`,
      },
    ]
    nominees.forEach((nominee) => {
      const read = decisionReads[nominee.id]
      lines.push(
        {
          id: `f3c-plea-${nominee.id}`,
          role: 'nominee',
          player: nominee,
          text: buildPlea(nominee, read),
        },
        {
          id: `f3c-plea-response-${nominee.id}`,
          role: 'loh',
          player: lohPlayer,
          text: buildPleaResponse(nominee, read),
        }
      )
    })
    lines.push({
      id: 'f3c-plea-close',
      role: 'loh',
      player: lohPlayer,
      text: `I've heard you both. Give me a moment to make the call.`,
    })
    return lines
  }, [decisionReads, lohPlayer, nominees])

  const spectatorAlreadyRevealedPower = game.finalThree?.spectatorFinalPowerRevealSeen === true
  const [stage, setStage] = useState<CeremonyStage>(() =>
    spectatorAlreadyRevealedPower
      ? pleaDialogueLines.length > 0
        ? 'pleas'
        : 'decision'
      : 'coronation'
  )
  const [pleaLines, setPleaLines] = useState<ChatLine[]>(pleaDialogueLines)
  const [announceLines, setAnnounceLines] = useState<ChatLine[]>([])
  const [evicteeId, setEvicteeId] = useState<string | null>(null)
  const evicteeIdRef = useRef<string | null>(null)
  const handledPlayStageRef = useRef<CeremonyStage | null>(null)

  const evicteePlayer = evicteeId ? (game.players.find((p) => p.id === evicteeId) ?? null) : null
  const finalTwo = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury' && player.id !== evicteeId
  )

  useEffect(() => {
    evicteeIdRef.current = evicteeId
  }, [evicteeId])

  useEffect(() => {
    if (stage === 'pleas') setPleaLines(pleaDialogueLines)
  }, [pleaDialogueLines, stage])

  useEffect(() => {
    const playAvailable = stage === 'coronation' || stage === 'final_two_reveal'
    onPlayAvailabilityChange?.(playAvailable)
    return () => onPlayAvailabilityChange?.(false)
  }, [onPlayAvailabilityChange, stage])

  useEffect(() => {
    const handlePlay = (event: Event) => {
      if (stage === 'pleas' || stage === 'announcement') return
      if (stage !== 'coronation' && stage !== 'final_two_reveal') return
      if (handledPlayStageRef.current === stage) return
      event.preventDefault()
      event.stopImmediatePropagation()
      handledPlayStageRef.current = stage
      if (stage === 'coronation') {
        setStage(pleaDialogueLines.length > 0 ? 'pleas' : 'decision')
        return
      }
      if (stage === 'final_two_reveal' && lohId && evicteeId) {
        dispatch(finalizeFinal3Decision({ hohWinnerId: lohId, evicteeId }))
        dispatch(advance())
        setStage('done')
      }
    }
    window.addEventListener('ui:playPressed', handlePlay)
    return () => window.removeEventListener('ui:playPressed', handlePlay)
  }, [dispatch, evicteeId, lohId, pleaDialogueLines.length, stage])

  // ── Build eviction announcement lines ────────────────────────────────────

  const buildAnnounceLines = useCallback(
    (evictee: Player, reason: string) => {
      const read = decisionReads[evictee.id]
      const lines: ChatLine[] = [
        {
          id: 'f3c-evict-decision',
          role: 'loh',
          player: lohPlayer ?? undefined,
          text: `I've made my decision. ${evictee.name}, I can't take you to the Final 2 — ${reason}.`,
        },
        {
          id: 'f3c-evict-host',
          role: 'host',
          text: `${evictee.name}, you finish in 3rd place and will take the bronze exit. ${thirdPlaceExitLine(evictee, read)}`,
        },
      ]
      setAnnounceLines(lines)
    },
    [decisionReads, lohPlayer]
  )

  // ── Plea overlay complete ─────────────────────────────────────────────────

  const handlePleaComplete = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] pleas complete → decision (humanIsLoh:', humanIsLoh, ')')
    }
    setStage('decision')
  }, [humanIsLoh])

  // AI Final LOHs use the same visible decision stage, then make a deliberate
  // move from the actual season record instead of a hidden random pick.
  useEffect(() => {
    if (stage !== 'decision' || humanIsLoh) return
    const pick = chooseAiEvictee(lohId, nominees, game.strategicRelationships)
    if (!pick) return
    setEvicteeId(pick.player.id)
    buildAnnounceLines(pick.player, pick.reason)
    setStage('announcement')
  }, [buildAnnounceLines, game.strategicRelationships, humanIsLoh, lohId, nominees, stage])

  // ── Human LOH decision ────────────────────────────────────────────────────

  const handleHumanDecision = useCallback(
    (chosenEvicteeId: string) => {
      if (import.meta.env.DEV) {
        console.log('[Final3Ceremony] human LOH evictee chosen', chosenEvicteeId)
      }
      const evictee = game.players.find((p) => p.id === chosenEvicteeId)
      if (!evictee) return
      setEvicteeId(chosenEvicteeId)
      buildAnnounceLines(
        evictee,
        decisionReads[chosenEvicteeId]?.reason ?? 'this is the move I can live with'
      )
      setStage('announcement')
    },
    [buildAnnounceLines, decisionReads, game.players]
  )

  // ── Announcement complete → eviction cinematic ───────────────────────────

  const handleAnnounceComplete = useCallback(() => {
    if (!evicteeId) return
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] announcement complete → eviction_splash', { evicteeId })
    }
    // Mark the overlay player so AvatarTile hides itself (isEvicting) and the
    // match-cut doesn't show a duplicate fullscreen tile before the overlay.
    dispatch(setEvictionOverlay(evicteeId))
    setStage('eviction_splash')
  }, [dispatch, evicteeId])

  // ── Eviction cinematic complete → Final Two reveal ────────────────────────

  const handleEvictionSplashDone = useCallback(() => {
    if (!lohId || !evicteeId) return
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] eviction splash done → final two reveal', {
        lohId,
        evicteeId,
      })
    }
    // Clear the overlay flag before the Final Two stage card takes over.
    dispatch(setEvictionOverlay(null))
    setStage('final_two_reveal')
  }, [dispatch, lohId, evicteeId])

  // ── Cleanup: clear the overlay flag on unmount (safety net) ───────────────

  useEffect(() => {
    // Clear the currently active eviction flag if this ceremony unmounts during
    // its splash. clearEvictionOverlay remains safe when another overlay has
    // already taken ownership of the store flag.
    return () => {
      dispatch(clearEvictionOverlay(evicteeIdRef.current ?? ''))
    }
    // dispatch is stable; the ref always holds the latest evictee.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  if (stage === 'done') return null

  return (
    <>
      {/* Coronation animation */}
      {stage === 'coronation' && lohPlayer && (
        <FinalPowerHolderReveal
          player={lohPlayer}
          mode="classic"
          continueCopy="Press Play when you are ready to make the Final Two decision."
        />
      )}

      {/* Plea ChatOverlay */}
      {stage === 'pleas' && pleaLines.length > 0 && (
        <ChatOverlay
          lines={pleaLines}
          skippable
          header={{
            title: 'Final Power Decision',
            subtitle: 'One last conversation before the Final Two is set.',
          }}
          avatarRenderer={(player) => (
            <PlayerAvatar player={player} size="sm" showEvictedStyle={false} />
          )}
          onComplete={handlePleaComplete}
          ariaLabel="The Finale plea chat"
        />
      )}

      {/* Human LOH decision modal */}
      {stage === 'decision' && humanIsLoh && (
        <TvDecisionModal
          title="Final Power Decision"
          subtitle="The Final Two is one choice away. The season record is here if it helps you decide."
          options={nominees}
          optionDescriptions={optionDescriptions}
          onSelect={handleHumanDecision}
          danger
          stingerMessage="EVICTION RECORDED"
        />
      )}

      {/* Eviction announcement ChatOverlay */}
      {stage === 'announcement' && announceLines.length > 0 && (
        <ChatOverlay
          lines={announceLines}
          skippable
          header={{
            title: 'The Finale · Bronze Exit',
            subtitle: 'The Final Power holder has made the decision.',
          }}
          avatarRenderer={(player) => (
            <PlayerAvatar player={player} size="sm" showEvictedStyle={false} />
          )}
          onComplete={handleAnnounceComplete}
          ariaLabel="The Finale elimination announcement"
        />
      )}

      {/* Eviction cinematic */}
      <AnimatePresence>
        {stage === 'eviction_splash' && evicteePlayer && (
          <SpotlightEvictionOverlay
            key={evicteePlayer.id}
            evictee={evicteePlayer}
            contextLabel="FINAL THREE · BRONZE EXIT"
            layoutId={`avatar-tile-${evicteePlayer.id}`}
            onDone={handleEvictionSplashDone}
            devSkip={DEV_SKIP}
          />
        )}
      </AnimatePresence>

      {stage === 'final_two_reveal' && (
        <div className="f3c-final-two" role="dialog" aria-modal="true" aria-label="The Final Two">
          <p className="f3c-final-two__eyebrow">THE FINAL TWO</p>
          <div className="f3c-final-two__players">
            {finalTwo.map((player) => (
              <div key={player.id} className="f3c-final-two__player">
                <div className="f3c-final-two__figure">
                  <FullSizeCutoutImage
                    player={player}
                    attire="informal"
                    className="f3c-final-two__cutout"
                    alt={player.name}
                    draggable={false}
                  />
                </div>
                <span>{player.name}</span>
              </div>
            ))}
          </div>
          <p className="f3c-final-two__copy">The Tribunal will decide who wins the season.</p>
          <p className="f3c-final-two__play-cue">
            Press Play when you are ready to enter the Tribunal.
          </p>
        </div>
      )}
    </>
  )
}
