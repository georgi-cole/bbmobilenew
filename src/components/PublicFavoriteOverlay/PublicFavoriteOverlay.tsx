import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import { useBattleBackVoting } from '../../hooks/useBattleBackVoting'
import { selectPublicOpinion } from '../../publicOpinion'
import { useAppSelector } from '../../store/hooks'
import type { Player } from '../../types'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import {
  buildHouseguestSpotlightItems,
  getActiveSpotlightPlayers,
  getSpotlightRotationDelayMs,
  selectSpotlightItem,
} from './publicFavoriteSpotlight'
import { buildPublicFavoriteForecast } from './publicFavoriteOutcome'
import './PublicFavoriteCinematic.css'

interface Props {
  candidates: Player[]
  seed: number
  awardAmount?: number
  eliminationIntervalMs?: number
  onComplete: (winnerId: string) => void
  onAudienceSurgeRequest?: (playerId: string) => Promise<boolean> | boolean
}

interface ViewerSpotlightState {
  playerId: string
}

type PublicVotePhase = 'intro' | 'feature' | 'elimination' | 'final_two' | 'final_reveal'

const ELIMINATION_INTERVAL_MS = 4800
const VOTE_TICK_INTERVAL_MS = 1000
const INTRO_MS = 2200
const SPOTLIGHT_DURATION_MS = 7000
const ELIMINATION_HOLD_MS = 1650
const FAST_FORWARD_ELIMINATION_INTERVAL_MS = 900
const FAST_FORWARD_TICK_INTERVAL_MS = 350

function formatEyeoleans(amount: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)} Eyeoleans`
}

function IntroStage() {
  return (
    <motion.section
      className="pf-cinematic__scene pf-cinematic__intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.52 }}
    >
      <div className="pf-cinematic__eye" aria-hidden="true">
        <span />
      </div>
      <p>LIVE FINALE</p>
      <h2>The public has made its choice.</h2>
      <span className="pf-cinematic__intro-rule" aria-hidden="true" />
    </motion.section>
  )
}

function FeatureStage({
  player,
  fact,
  remaining,
  spotlightActive,
  spotlightAvailable,
  spotlightPending,
  onSpotlight,
}: {
  player: Player
  fact: string
  remaining: number
  spotlightActive: boolean
  spotlightAvailable: boolean
  spotlightPending: boolean
  onSpotlight: () => void
}) {
  return (
    <motion.section
      key={player.id}
      className={`pf-cinematic__scene pf-cinematic__feature${spotlightActive ? ' pf-cinematic__feature--spotlight' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.58 }}
    >
      <div className="pf-cinematic__feature-light" aria-hidden="true" />
      <motion.div
        className="pf-cinematic__feature-portrait"
        initial={{ opacity: 0, x: -22, scale: 1.025 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
      >
        <FullSizeCutoutImage
          player={player}
          alt={player.name}
          className="pf-cinematic__feature-cutout"
          loading="eager"
        />
      </motion.div>
      <motion.div
        className="pf-cinematic__feature-copy"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.52, delay: 0.3 }}
      >
        <p>{remaining} housemates remain in the public vote</p>
        <h2>{player.name}</h2>
        <blockquote>{fact}</blockquote>
        {spotlightActive && <span>Viewer Spotlight</span>}
      </motion.div>

      {spotlightAvailable && (
        <button
          type="button"
          className="pf-cinematic__spotlight-cta"
          onClick={onSpotlight}
          disabled={spotlightPending}
        >
          {spotlightPending ? 'Connecting…' : `Spotlight ${player.name}`}
        </button>
      )}
    </motion.section>
  )
}

function EliminationStage({ player }: { player: Player }) {
  return (
    <motion.section
      className="pf-cinematic__scene pf-cinematic__elimination"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.36 }}
      aria-live="polite"
    >
      <div className="pf-cinematic__elimination-rim" aria-hidden="true" />
      <motion.div
        className="pf-cinematic__elimination-portrait"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.52 }}
      >
        <FullSizeCutoutImage
          player={player}
          alt={player.name}
          className="pf-cinematic__elimination-cutout"
          loading="eager"
        />
      </motion.div>
      <div className="pf-cinematic__elimination-copy">
        <p>The public says goodbye to</p>
        <h2>{player.name}</h2>
      </div>
    </motion.section>
  )
}

function FinalTwoStage({ finalists }: { finalists: Player[] }) {
  return (
    <motion.section
      className="pf-cinematic__scene pf-cinematic__final-two"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.58 }}
    >
      <div className="pf-cinematic__final-two-copy">
        <p>THE FINAL TWO</p>
        <h2>One last decision belongs to the audience.</h2>
      </div>
      <div className="pf-cinematic__final-two-stage">
        {finalists.map((player, index) => (
          <motion.div
            key={player.id}
            className="pf-cinematic__finalist"
            initial={{ opacity: 0, x: index === 0 ? -28 : 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.16 + index * 0.17 }}
          >
            <FullSizeCutoutImage
              player={player}
              alt={player.name}
              className="pf-cinematic__finalist-cutout"
              loading="eager"
            />
            <span>{player.name}</span>
          </motion.div>
        ))}
      </div>
    </motion.section>
  )
}

function FinalReveal({
  winner,
  awardAmount,
  onClose,
}: {
  winner: Player | undefined
  awardAmount: number
  onClose: () => void
}) {
  return (
    <motion.section
      className="pf-cinematic__scene pf-cinematic__winner"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.62 }}
    >
      <div className="pf-cinematic__winner-rays" aria-hidden="true" />
      <motion.div
        className="pf-cinematic__winner-portrait"
        initial={{ opacity: 0, y: 28, scale: 1.035 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.82, ease: [0.22, 1, 0.36, 1] }}
      >
        {winner ? (
          <FullSizeCutoutImage
            player={winner}
            alt={winner.name}
            className="pf-cinematic__winner-cutout"
            loading="eager"
          />
        ) : (
          <span className="pf-cinematic__winner-fallback" aria-hidden="true">
            ◉
          </span>
        )}
      </motion.div>
      <motion.div
        className="pf-cinematic__winner-copy"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.56, delay: 0.46 }}
      >
        <p>PUBLIC&apos;S FAVORITE PLAYER</p>
        <h2>{winner?.name ?? 'Result unavailable'}</h2>
        {winner && <strong>Wins {formatEyeoleans(awardAmount)}</strong>}
        <span>The audience chose the housemate they will remember.</span>
        <button type="button" onClick={onClose} disabled={!winner}>
          Continue
        </button>
      </motion.div>
    </motion.section>
  )
}

export default function PublicFavoriteOverlay({
  candidates,
  seed,
  awardAmount = 25000,
  eliminationIntervalMs = ELIMINATION_INTERVAL_MS,
  onComplete,
  onAudienceSurgeRequest,
}: Props) {
  const publicOpinion = useAppSelector(selectPublicOpinion)
  const prefersReducedMotion = useReducedMotion()
  const forecast = useMemo(
    () => buildPublicFavoriteForecast(candidates, publicOpinion, seed),
    [candidates, publicOpinion, seed]
  )
  const candidateIds = useMemo(() => candidates.map((candidate) => candidate.id), [candidates])
  const candidatesById = useMemo(
    () => Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates]
  )

  const [introDone, setIntroDone] = useState(false)
  const [fastForwarding, setFastForwarding] = useState(false)
  const [spotlightPending, setSpotlightPending] = useState(false)
  const [spotlightUsed, setSpotlightUsed] = useState(false)
  const [viewerSpotlight, setViewerSpotlight] = useState<ViewerSpotlightState | null>(null)
  const [eliminationMoment, setEliminationMoment] = useState<Player | null>(null)
  const [spotlightRotation, setSpotlightRotation] = useState(0)
  const previousEliminatedCountRef = useRef(0)
  const completionFiredRef = useRef(false)
  const requestLockedRef = useRef(false)
  const mountedRef = useRef(true)
  const eliminationTimeoutRef = useRef<number | null>(null)
  const viewerSpotlightTimeoutRef = useRef<number | null>(null)
  const fastForwardButtonRef = useRef<HTMLButtonElement | null>(null)

  const effectiveEliminationIntervalMs = fastForwarding
    ? Math.min(eliminationIntervalMs, FAST_FORWARD_ELIMINATION_INTERVAL_MS)
    : eliminationIntervalMs

  const { eliminated, winnerId, isComplete } = useBattleBackVoting({
    candidates: candidateIds,
    seed,
    eliminationIntervalMs: effectiveEliminationIntervalMs,
    tickIntervalMs: fastForwarding ? FAST_FORWARD_TICK_INTERVAL_MS : VOTE_TICK_INTERVAL_MS,
    driftAmount: fastForwarding ? 1.4 : 2.4,
    targetPercentages: forecast.targetPercentages,
  })

  useEffect(() => {
    mountedRef.current = true
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    fastForwardButtonRef.current?.focus()
    return () => {
      mountedRef.current = false
      document.body.style.overflow = previousOverflow
      if (eliminationTimeoutRef.current != null) window.clearTimeout(eliminationTimeoutRef.current)
      if (viewerSpotlightTimeoutRef.current != null) {
        window.clearTimeout(viewerSpotlightTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (introDone || isComplete) return
    const timer = window.setTimeout(() => setIntroDone(true), INTRO_MS)
    return () => window.clearTimeout(timer)
  }, [introDone, isComplete])

  useEffect(() => {
    if (eliminated.length <= previousEliminatedCountRef.current) {
      previousEliminatedCountRef.current = eliminated.length
      return
    }

    const eliminatedId = eliminated.at(-1)
    const player = eliminatedId ? candidatesById[eliminatedId] : undefined
    if (player) {
      setEliminationMoment(player)
      if (eliminationTimeoutRef.current != null) window.clearTimeout(eliminationTimeoutRef.current)
      eliminationTimeoutRef.current = window.setTimeout(
        () => setEliminationMoment(null),
        ELIMINATION_HOLD_MS
      )
    }
    previousEliminatedCountRef.current = eliminated.length
  }, [candidatesById, eliminated])

  const activePlayers = useMemo(
    () => getActiveSpotlightPlayers(candidates, eliminated),
    [candidates, eliminated]
  )
  const orderedFinalists = useMemo(
    () =>
      [...activePlayers].sort(
        (left, right) =>
          (forecast.targetPercentages[right.id] ?? 0) - (forecast.targetPercentages[left.id] ?? 0)
      ),
    [activePlayers, forecast.targetPercentages]
  )
  const allSpotlightItems = useMemo(() => buildHouseguestSpotlightItems(candidates), [candidates])
  const activeSpotlightItems = useMemo(
    () =>
      allSpotlightItems.filter((item) =>
        activePlayers.some((player) => player.id === item.player.id)
      ),
    [activePlayers, allSpotlightItems]
  )
  const naturalSpotlight = useMemo(
    () => selectSpotlightItem(activeSpotlightItems, spotlightRotation),
    [activeSpotlightItems, spotlightRotation]
  )
  const forcedSpotlight = useMemo(() => {
    if (!viewerSpotlight) return null
    const item = activeSpotlightItems.find(
      (candidate) => candidate.player.id === viewerSpotlight.playerId
    )
    return item
      ? { item, fact: item.facts[0] ?? `${item.player.name} remains in the public vote.` }
      : null
  }, [activeSpotlightItems, viewerSpotlight])
  const featuredSpotlight = forcedSpotlight ?? naturalSpotlight

  useEffect(() => {
    if (
      !introDone ||
      isComplete ||
      eliminationMoment ||
      activePlayers.length <= 2 ||
      viewerSpotlight ||
      !naturalSpotlight
    ) {
      return
    }

    const timer = window.setTimeout(
      () => setSpotlightRotation((rotation) => rotation + 1),
      getSpotlightRotationDelayMs(naturalSpotlight.fact)
    )
    return () => window.clearTimeout(timer)
  }, [
    activePlayers.length,
    eliminationMoment,
    introDone,
    isComplete,
    naturalSpotlight,
    viewerSpotlight,
  ])

  const canActivateSpotlight =
    introDone &&
    eliminated.length === 0 &&
    !isComplete &&
    !spotlightUsed &&
    !spotlightPending &&
    featuredSpotlight !== null

  const handleSpotlight = useCallback(async () => {
    const playerId = featuredSpotlight?.item.player.id
    if (
      !playerId ||
      !canActivateSpotlight ||
      requestLockedRef.current ||
      spotlightPending ||
      spotlightUsed
    ) {
      return
    }

    requestLockedRef.current = true
    setSpotlightPending(true)
    try {
      const granted = await Promise.resolve(
        onAudienceSurgeRequest ? onAudienceSurgeRequest(playerId) : true
      )
      if (!mountedRef.current || !granted) return
      setSpotlightUsed(true)
      setViewerSpotlight({ playerId })
      viewerSpotlightTimeoutRef.current = window.setTimeout(
        () => setViewerSpotlight(null),
        SPOTLIGHT_DURATION_MS
      )
    } catch {
      // Dismissal or an unavailable rewarded placement leaves the option unused.
    } finally {
      requestLockedRef.current = false
      if (mountedRef.current) setSpotlightPending(false)
    }
  }, [
    canActivateSpotlight,
    featuredSpotlight,
    onAudienceSurgeRequest,
    spotlightPending,
    spotlightUsed,
  ])

  const handleFastForward = useCallback(() => {
    if (fastForwarding || isComplete || spotlightPending) return
    setIntroDone(true)
    setFastForwarding(true)
  }, [fastForwarding, isComplete, spotlightPending])

  const resolvedWinnerId = winnerId ?? (isComplete ? forecast.winnerId : null)
  const winner = resolvedWinnerId ? candidatesById[resolvedWinnerId] : undefined
  const handleClose = useCallback(() => {
    if (!resolvedWinnerId || completionFiredRef.current) return
    completionFiredRef.current = true
    onComplete(resolvedWinnerId)
  }, [onComplete, resolvedWinnerId])

  const phase: PublicVotePhase = isComplete
    ? 'final_reveal'
    : !introDone
      ? 'intro'
      : eliminationMoment
        ? 'elimination'
        : activePlayers.length === 2
          ? 'final_two'
          : 'feature'

  return (
    <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'never'}>
      <div
        className={`pf-overlay pf-cinematic${prefersReducedMotion ? ' pf-cinematic--reduced-motion' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Public's Favorite Player overlay"
        data-phase={phase}
      >
        <div className="pf-cinematic__background" aria-hidden="true" />
        <div className="pf-cinematic__vignette" aria-hidden="true" />
        <div className="pf-cinematic__live-bug" aria-hidden="true">
          <span>LIVE</span>
          <strong>Public Vote</strong>
        </div>

        {!isComplete && (
          <div className="pf-cinematic__controls">
            {phase === 'intro' && (
              <button type="button" onClick={() => setIntroDone(true)}>
                Skip intro
              </button>
            )}
            <button
              ref={fastForwardButtonRef}
              type="button"
              onClick={handleFastForward}
              disabled={fastForwarding || spotlightPending}
              aria-label="Fast forward public favorite vote"
            >
              {fastForwarding ? 'Forwarding' : 'Fast forward'}
            </button>
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {phase === 'intro' && <IntroStage key="intro" />}
          {phase === 'feature' && featuredSpotlight && (
            <FeatureStage
              key={`feature-${featuredSpotlight.item.player.id}-${viewerSpotlight?.playerId ?? spotlightRotation}`}
              player={featuredSpotlight.item.player}
              fact={featuredSpotlight.fact}
              remaining={activePlayers.length}
              spotlightActive={viewerSpotlight?.playerId === featuredSpotlight.item.player.id}
              spotlightAvailable={canActivateSpotlight}
              spotlightPending={spotlightPending}
              onSpotlight={handleSpotlight}
            />
          )}
          {phase === 'elimination' && eliminationMoment && (
            <EliminationStage
              key={`elimination-${eliminationMoment.id}`}
              player={eliminationMoment}
            />
          )}
          {phase === 'final_two' && (
            <FinalTwoStage key="final-two" finalists={orderedFinalists.slice(0, 2)} />
          )}
          {phase === 'final_reveal' && (
            <FinalReveal
              key="winner"
              winner={winner}
              awardAmount={awardAmount}
              onClose={handleClose}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
