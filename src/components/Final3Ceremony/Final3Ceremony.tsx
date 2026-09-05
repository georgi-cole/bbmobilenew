/**
 * Final3Ceremony — the post-Part-3 ceremony overlay.
 *
 * Triggered when `game.awaitingFinal3Plea` is true and the Final LOH has been
 * crowned (`game.lohId` is set, phase is 'final3_decision').
 *
 * Sequence:
 *   1. Coronation animation — crown reveal for the Final LOH.
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

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  advance,
  finalizeFinal3Decision,
  setEvictionOverlay,
  clearEvictionOverlay,
} from '../../store/gameSlice'
import { mulberry32, seededPick } from '../../store/rng'
import { pickPhrase, NOMINEE_PLEA_TEMPLATES } from '../../utils/juryUtils'
import ChatOverlay from '../ChatOverlay/ChatOverlay'
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar'
import TvDecisionModal from '../TvDecisionModal/TvDecisionModal'
import SpotlightEvictionOverlay from '../Eviction/SpotlightEvictionOverlay'
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
  | 'done'

// ── Constants ────────────────────────────────────────────────────────────────

const DEV_SKIP = import.meta.env.DEV || import.meta.env.CI === 'true'

// ── Component ─────────────────────────────────────────────────────────────────

export default function Final3Ceremony() {
  const dispatch = useAppDispatch()
  const game = useAppSelector((s) => s.game)

  const lohId = game.lohId
  const lohPlayer = game.players.find((p) => p.id === lohId) ?? null
  const nominees = game.players.filter((p) => game.nomineeIds.includes(p.id))
  const humanPlayer = game.players.find((p) => p.isUser) ?? null
  const humanIsLoh = !!humanPlayer && humanPlayer.id === lohId

  const [stage, setStage] = useState<CeremonyStage>('coronation')
  const [pleaLines, setPleaLines] = useState<ChatLine[]>([])
  const [announceLines, setAnnounceLines] = useState<ChatLine[]>([])
  const [evicteeId, setEvicteeId] = useState<string | null>(null)

  const evicteePlayer = evicteeId ? (game.players.find((p) => p.id === evicteeId) ?? null) : null

  // ── Build plea lines when entering the plea stage ─────────────────────────

  useEffect(() => {
    if (stage !== 'pleas' || !lohPlayer || nominees.length === 0) return
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] building plea lines', {
        lohId,
        nominees: nominees.map((n) => n.id),
      })
    }
    const lines: ChatLine[] = [
      {
        id: 'f3c-intro',
        role: 'host',
        text: `${lohPlayer.name} has won Part 3 and is the Final Leader of the House! 👑`,
      },
      {
        id: 'f3c-plea-prompt',
        role: 'loh',
        player: lohPlayer,
        text: `Before I make my decision, I'd like to hear from both of you. Nominees, it's time to make your pleas.`,
      },
      ...nominees.flatMap((nominee, idx): ChatLine[] => [
        {
          id: `f3c-prompt-${nominee.id}`,
          role: 'loh',
          player: lohPlayer,
          text: `${nominee.name}, please share why I should take you to the Final 2.`,
        },
        {
          id: `f3c-plea-${nominee.id}`,
          role: 'nominee',
          player: nominee,
          text: pickPhrase(NOMINEE_PLEA_TEMPLATES, game.seed, idx),
        },
      ]),
      {
        id: 'f3c-thinking',
        role: 'hoh-thinking',
        player: lohPlayer,
        text: '• • •',
      },
    ]
    setPleaLines(lines)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]) // only rebuild when stage flips to 'pleas'

  // ── Coronation auto-advance after animation ───────────────────────────────

  useEffect(() => {
    if (stage !== 'coronation') return
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] coronation stage started', { lohId })
    }
    const id = window.setTimeout(() => {
      if (import.meta.env.DEV) {
        console.log('[Final3Ceremony] coronation complete → pleas')
      }
      setStage('pleas')
    }, 2800)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  // ── Build eviction announcement lines ────────────────────────────────────

  const buildAnnounceLines = useCallback(
    (evictee: Player) => {
      const lines: ChatLine[] = [
        {
          id: 'f3c-evict-decision',
          role: 'loh',
          player: lohPlayer ?? undefined,
          text: `I've made my decision. ${evictee.name}, I'm eliminating you from The Big Eye house. 🗳️`,
        },
        {
          id: 'f3c-evict-host',
          role: 'host',
          text: `${evictee.name}, you have been eliminated and will finish in 3rd place. 🥉`,
        },
      ]
      setAnnounceLines(lines)
    },
    [lohPlayer]
  )

  // ── Plea overlay complete ─────────────────────────────────────────────────

  const handlePleaComplete = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] pleas complete → decision (humanIsLoh:', humanIsLoh, ')')
    }
    if (humanIsLoh) {
      setStage('decision')
    } else {
      // AI LOH: deterministically pick evictee using seeded RNG (mirrors advance()).
      const aiRng = mulberry32(game.seed + 1)
      const pick = seededPick(aiRng, nominees)
      if (import.meta.env.DEV) {
        console.log('[Final3Ceremony] AI evictee picked', pick.id)
      }
      setEvicteeId(pick.id)
      buildAnnounceLines(pick)
      setStage('announcement')
    }
  }, [buildAnnounceLines, game.seed, humanIsLoh, nominees])

  // ── Human LOH decision ────────────────────────────────────────────────────

  const handleHumanDecision = useCallback(
    (chosenEvicteeId: string) => {
      if (import.meta.env.DEV) {
        console.log('[Final3Ceremony] human LOH evictee chosen', chosenEvicteeId)
      }
      const evictee = game.players.find((p) => p.id === chosenEvicteeId)
      if (!evictee) return
      setEvicteeId(chosenEvicteeId)
      buildAnnounceLines(evictee)
      setStage('announcement')
    },
    [buildAnnounceLines, game.players]
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

  // ── Eviction cinematic complete → finalize ────────────────────────────────

  const handleEvictionSplashDone = useCallback(() => {
    if (!lohId || !evicteeId) return
    if (import.meta.env.DEV) {
      console.log('[Final3Ceremony] eviction splash done → finalizeFinal3Decision + advance', {
        lohId,
        evicteeId,
      })
    }
    // Clear the overlay flag before finalizing so AvatarTile returns to normal.
    dispatch(setEvictionOverlay(null))
    dispatch(finalizeFinal3Decision({ hohWinnerId: lohId, evicteeId }))
    dispatch(advance())
    setStage('done')
  }, [dispatch, lohId, evicteeId])

  // ── Cleanup: clear the overlay flag on unmount (safety net) ───────────────

  useEffect(() => {
    // Capture evicteeId at effect registration time so the cleanup can reference
    // it without stale closure issues. clearEvictionOverlay is a no-op if the
    // store flag has already been set to a different player by a subsequent overlay.
    return () => {
      dispatch(clearEvictionOverlay(evicteeId ?? ''))
    }
    // dispatch is stable; evicteeId is intentionally captured at mount time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────

  if (stage === 'done') return null

  return (
    <>
      {/* Coronation animation */}
      {stage === 'coronation' && lohPlayer && (
        <div
          className="f3c-coronation"
          role="dialog"
          aria-modal="true"
          aria-label="Final LOH Coronation"
        >
          <div className="f3c-coronation__crown" aria-hidden="true">
            👑
          </div>
          <div className="f3c-coronation__name">{lohPlayer.name}</div>
          <div className="f3c-coronation__title">Final Leader of the House</div>
          <div className="f3c-coronation__subtitle">Part 3 Winner</div>
        </div>
      )}

      {/* Plea ChatOverlay */}
      {stage === 'pleas' && pleaLines.length > 0 && (
        <ChatOverlay
          lines={pleaLines}
          skippable
          header={{ title: 'The Finale 🏠', subtitle: 'Nominees make their final pleas.' }}
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
          title="Final LOH — Eliminate a Player"
          subtitle={`${lohPlayer?.name ?? 'You'}, as Final LOH you must directly eliminate one of the remaining players.`}
          options={nominees}
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
          header={{ title: 'The Finale 🚪', subtitle: 'The Final LOH has made their decision.' }}
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
            contextLabel={`Season ${game.season} · Day ${game.week}`}
            layoutId={`avatar-tile-${evicteePlayer.id}`}
            onDone={handleEvictionSplashDone}
            devSkip={DEV_SKIP}
          />
        )}
      </AnimatePresence>
    </>
  )
}
