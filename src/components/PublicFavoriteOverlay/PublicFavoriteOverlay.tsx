import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import { selectPublicOpinion } from '../../publicOpinion'
import { useAppSelector } from '../../store/hooks'
import type { Player } from '../../types'
import { useBattleBackVoting } from '../../hooks/useBattleBackVoting'
import { resolveAvatarCandidates } from '../../utils/avatar'
import {
  buildHouseguestSpotlightItems,
  getActiveSpotlightPlayers,
  getSpotlightRotationDelayMs,
  selectSpotlightItem,
} from './publicFavoriteSpotlight'
import { buildPublicFavoriteForecast } from './publicFavoriteOutcome'
import { buildFinaleAudienceFeed } from './finaleAudienceFeed'
import './PublicFavoriteOverlay.css'
import './PublicFavoriteProfessional.css'

interface Props {
  candidates: Player[]
  seed: number
  mode?: 'favorite' | 'season_winner'
  awardAmount?: number
  eliminationIntervalMs?: number
  onComplete: (winnerId: string) => void
  onAudienceSurgeRequest?: (playerId: string) => Promise<boolean> | boolean
}

type VoteTrend = 'up' | 'down' | 'stable'
type PublicVotePhase = 'intro' | 'live_results' | 'elimination' | 'final_two' | 'final_reveal'

interface SpotlightState {
  playerId: string
  endsAt: number
}

interface VoteEntry {
  playerId: string
  name: string
  percent: number
  rank: number
  previousRank: number
  trend: VoteTrend
  isLeader: boolean
  isSpotlighted: boolean
}

const ELIMINATION_INTERVAL_MS = 4800
const SEASON_WINNER_VOTE_MS = 23_000
const SEASON_WINNER_IDENTITY_REVEAL_MS = 10_000
const VOTE_TICK_INTERVAL_MS = 1000
const INTRO_MS = 1600
const CLOCK_INTERVAL_MS = 500
const SPOTLIGHT_SELECTION_WINDOW_MS = 7000
const SPOTLIGHT_DURATION_MS = 7000
const ELIMINATION_HOLD_MS = 1200
const FAST_FORWARD_ELIMINATION_INTERVAL_MS = 850
const FAST_FORWARD_TICK_INTERVAL_MS = 300
const MAX_VISIBLE_RANKS = 8

function formatEyeoleans(amount: number): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)} Eyeoleans`
}

function countdown(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000))
}

function formatRevealCountdown(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function voteTrend(previousRank: number, rank: number): VoteTrend {
  if (previousRank > rank) return 'up'
  if (previousRank < rank) return 'down'
  return 'stable'
}

function PlayerPortrait({ player, className = '' }: { player: Player; className?: string }) {
  const sources = useMemo(() => resolveAvatarCandidates(player), [player])
  const [sourceIndex, setSourceIndex] = useState(0)
  const source = sources[sourceIndex]

  return (
    <div className={`pf-overlay__portrait ${className}`.trim()}>
      {source ? (
        <img
          src={source}
          alt={player.name}
          className="pf-overlay__avatar-img"
          loading="eager"
          decoding="async"
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <span className="pf-overlay__portrait-fallback" aria-hidden="true">
          {player.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  )
}

function TrendMarker({ entry }: { entry: VoteEntry }) {
  const symbol = entry.trend === 'up' ? '▲' : entry.trend === 'down' ? '▼' : '•'
  const label =
    entry.trend === 'up'
      ? `Up from rank ${entry.previousRank}`
      : entry.trend === 'down'
        ? `Down from rank ${entry.previousRank}`
        : `Holding at rank ${entry.rank}`

  return (
    <span
      className={`pf-overlay__trend pf-overlay__trend--${entry.trend}`}
      title={label}
      aria-label={label}
    >
      {symbol}
    </span>
  )
}

function VoteRankingBoard({
  entries,
  candidatesById,
  selectedPlayerId,
  onSelect,
  identitiesHidden,
  anonymousLabelsById,
}: {
  entries: VoteEntry[]
  candidatesById: Record<string, Player>
  selectedPlayerId: string | null
  onSelect: (playerId: string) => void
  identitiesHidden: boolean
  anonymousLabelsById: Record<string, string>
}) {
  const visibleEntries = entries.slice(0, MAX_VISIBLE_RANKS)
  const hiddenCount = Math.max(0, entries.length - visibleEntries.length)

  return (
    <section className="pf-overlay__board" aria-label="Public vote ranking board">
      <div className="pf-overlay__board-header">
        <p className="pf-overlay__board-title">Live audience vote</p>
        <span>{entries.length} remaining</span>
      </div>
      <div className="pf-overlay__board-list">
        {visibleEntries.map((entry) => {
          const player = candidatesById[entry.playerId]
          if (!player) return null
          const displayName = identitiesHidden
            ? (anonymousLabelsById[entry.playerId] ?? 'Finalist')
            : entry.name
          return (
            <motion.button
              key={entry.playerId}
              type="button"
              className={`pf-overlay__rank-card${entry.isLeader ? ' pf-overlay__rank-card--leader' : ''}${entry.isSpotlighted ? ' pf-overlay__rank-card--surge' : ''}${selectedPlayerId === entry.playerId ? ' pf-overlay__rank-card--selected' : ''}`}
              onClick={() => {
                if (!identitiesHidden) onSelect(entry.playerId)
              }}
              aria-label={`${displayName}, rank ${entry.rank}, ${entry.percent}%`}
              aria-disabled={identitiesHidden}
              layout
              transition={{ layout: { duration: 0.32, ease: 'easeOut' } }}
            >
              <span className="pf-overlay__rank-number">#{entry.rank}</span>
              {identitiesHidden ? (
                <span className="pf-overlay__portrait pf-overlay__portrait--sealed" aria-hidden="true">
                  ?
                </span>
              ) : (
                <PlayerPortrait player={player} />
              )}
              <div className="pf-overlay__rank-copy">
                <div className="pf-overlay__rank-name-row">
                  <span className="pf-overlay__rank-name">{displayName}</span>
                  <TrendMarker entry={entry} />
                </div>
                <div className="pf-overlay__accent-rail" aria-hidden="true">
                  <span className="pf-overlay__accent-track" />
                  <motion.span
                    className="pf-overlay__accent-fill"
                    animate={{ width: `${Math.max(4, entry.percent)}%` }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  />
                </div>
              </div>
              <div className="pf-overlay__rank-tail">
                <span className="pf-overlay__percent-value">{entry.percent}%</span>
                {entry.isSpotlighted ? (
                  <span className="pf-overlay__rank-tag">Spotlight</span>
                ) : entry.isLeader ? (
                  <span className="pf-overlay__rank-tag">Live lead</span>
                ) : null}
              </div>
            </motion.button>
          )
        })}
      </div>
      {hiddenCount > 0 && (
        <p className="pf-overlay__remaining-note">
          +{hiddenCount} housemates remain below the live cut.
        </p>
      )}
    </section>
  )
}

function HousemateSpotlight({
  spotlight,
  finalTwoNames,
  revealCountdown,
  identitiesHidden,
  showRevealCountdown,
}: {
  spotlight: ReturnType<typeof selectSpotlightItem>
  finalTwoNames: string | null
  revealCountdown: number
  identitiesHidden: boolean
  showRevealCountdown: boolean
}) {
  if (identitiesHidden) {
    return (
      <motion.section
        className="pf-overlay__spotlight pf-overlay__spotlight--sealed"
        role="region"
        aria-label="Finalist identities sealed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="pf-overlay__sealed-copy">
          <p className="pf-overlay__leader-kicker">The final vote is live</p>
          <h3 className="pf-overlay__leader-name">Two identities. One crown.</h3>
          <p className="pf-overlay__spotlight-fact">
            The percentages are moving, but the faces behind them remain hidden for now.
          </p>
        </div>
        <div className="pf-overlay__sealed-pair" aria-hidden="true">
          <span>?</span>
          <span>?</span>
        </div>
      </motion.section>
    )
  }
  if (!spotlight) return null
  const { player } = spotlight.item

  return (
    <motion.section
      className="pf-overlay__spotlight"
      role="region"
      aria-label="Houseguest Spotlight"
      data-testid="housemate-spotlight"
      layout
    >
      <div className="pf-overlay__leader-copy">
        <p className="pf-overlay__leader-kicker">
          {finalTwoNames ? `Final two · ${finalTwoNames}` : 'Housemate file'}
        </p>
        <h3 className="pf-overlay__leader-name">{player.name}</h3>
        <motion.p
          key={`${player.id}-${spotlight.fact}`}
          className="pf-overlay__spotlight-fact"
          initial={{ opacity: 0, y: 7 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          {spotlight.fact}
        </motion.p>
        {showRevealCountdown && (
          <p
            className="pf-overlay__moment-stat pf-overlay__moment-stat--final-countdown"
            aria-label={`Final reveal in ${formatRevealCountdown(revealCountdown)}`}
          >
            <span>Final reveal in</span>
            <strong>{formatRevealCountdown(revealCountdown)}</strong>
          </p>
        )}
      </div>
      <div className="pf-overlay__leader-portrait-wrap">
        <div className="pf-overlay__leader-glow" aria-hidden="true" />
        <PlayerPortrait
          player={player}
          className="pf-overlay__leader-avatar pf-overlay__leader-avatar--portrait"
        />
      </div>
    </motion.section>
  )
}

function ViewerSpotlightPanel({
  selectedPlayer,
  activeSpotlight,
  used,
  pending,
  canActivate,
  onActivate,
}: {
  selectedPlayer: Player | null
  activeSpotlight: SpotlightState | null
  used: boolean
  pending: boolean
  canActivate: boolean
  onActivate: () => void
}) {
  return (
    <footer className="pf-overlay__footer">
      <section className="pf-overlay__surge-panel" aria-label="Viewer Spotlight">
        <div className="pf-overlay__surge-copy">
          <p className="pf-overlay__surge-kicker">Viewer Spotlight</p>
          <p className="pf-overlay__surge-description">
            {activeSpotlight && selectedPlayer
              ? `${selectedPlayer.name} is featured on the broadcast. Official vote totals are unchanged.`
              : 'Select a housemate on the board, then watch to feature them. This does not change the official result.'}
          </p>
        </div>
        <button
          type="button"
          className="pf-overlay__surge-cta"
          onClick={onActivate}
          disabled={!selectedPlayer || !canActivate || pending}
        >
          {pending
            ? 'Connecting…'
            : activeSpotlight
              ? 'Viewer Spotlight Active'
              : used
                ? 'Viewer Spotlight Used'
                : `Watch to Spotlight${selectedPlayer ? ` ${selectedPlayer.name}` : ''}`}
        </button>
      </section>
    </footer>
  )
}

function FinaleAudienceFeed({
  items,
}: {
  items: ReturnType<typeof buildFinaleAudienceFeed>
}) {
  if (items.length === 0) return null
  return (
    <section className="pf-overlay__audience-feed" aria-label="Live audience reactions">
      <header>
        <span className="pf-overlay__live-dot" />
        <strong>Audience live</strong>
        <small>Comments and voting activity</small>
      </header>
      <div className="pf-overlay__audience-feed-list" aria-live="polite">
        {items.map((item) => (
          <motion.p
            key={item.id}
            className={`pf-overlay__audience-feed-item pf-overlay__audience-feed-item--${item.kind}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span>{item.kind === 'service' ? 'LIVE DESK' : 'VIEWER'}</span>
            {item.text}
          </motion.p>
        ))}
      </div>
    </section>
  )
}

function FinalReveal({
  winner,
  runnerUp,
  awardAmount,
  mode,
  onClose,
}: {
  winner: Player | undefined
  runnerUp: Player | undefined
  awardAmount: number
  mode: 'favorite' | 'season_winner'
  onClose: () => void
}) {
  return (
    <motion.div
      className="pf-overlay__winner-stage"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="pf-overlay__winner-badge">FINAL REVEAL</span>
      <p className="pf-overlay__eyebrow">
        {mode === 'season_winner' ? 'Season Winner' : `Public's Favorite Player`}
      </p>
      <div className="pf-overlay__winner-avatar-wrap">
        <div className="pf-overlay__winner-glow" aria-hidden="true" />
        {winner ? (
          <PlayerPortrait
            player={winner}
            className="pf-overlay__winner-avatar pf-overlay__winner-avatar--portrait"
          />
        ) : (
          <span className="pf-overlay__winner-fallback" aria-hidden="true">
            🏆
          </span>
        )}
      </div>
      {winner && runnerUp && mode === 'season_winner' && (
        <p className="pf-overlay__runner-up">{runnerUp.name} finishes as runner-up.</p>
      )}
      <h2 className="pf-overlay__headline">{winner?.name ?? 'Result unavailable'}</h2>
      {winner && mode === 'favorite' && (
        <p className="pf-overlay__winner-prize">Wins {formatEyeoleans(awardAmount)}!</p>
      )}
      <p className="pf-overlay__sub">
        {mode === 'season_winner'
          ? 'The audience has spoken. The season belongs to its champion.'
          : 'The season-long audience record has spoken.'}
      </p>
      <button type="button" className="pf-overlay__winner-cta" onClick={onClose} disabled={!winner}>
        Continue
      </button>
    </motion.div>
  )
}

export default function PublicFavoriteOverlay({
  candidates,
  seed,
  mode = 'favorite',
  awardAmount = 25000,
  eliminationIntervalMs,
  onComplete,
  onAudienceSurgeRequest,
}: Props) {
  const publicOpinion = useAppSelector(selectPublicOpinion)
  const configuredEliminationIntervalMs =
    eliminationIntervalMs ?? (mode === 'season_winner' ? SEASON_WINNER_VOTE_MS : ELIMINATION_INTERVAL_MS)
  const effectiveIntroMs = mode === 'season_winner' ? 0 : INTRO_MS
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
  const anonymousLabelsById = useMemo(
    () =>
      Object.fromEntries(
        candidates.map((candidate) => [
          candidate.id,
          '?',
        ])
      ),
    [candidates]
  )

  const [nowMs, setNowMs] = useState(() => Date.now())
  const [mountedAt] = useState(() => Date.now())
  const [introSkipBoostMs, setIntroSkipBoostMs] = useState(0)
  const [fastForwarding, setFastForwarding] = useState(false)
  const [nextShiftAt, setNextShiftAt] = useState(
    () => Date.now() + configuredEliminationIntervalMs
  )
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(candidates[0]?.id ?? null)
  const [spotlightPending, setSpotlightPending] = useState(false)
  const [spotlightUsed, setSpotlightUsed] = useState(false)
  const [activeSpotlight, setActiveSpotlight] = useState<SpotlightState | null>(null)
  const [eliminationMoment, setEliminationMoment] = useState<{
    player: Player
    startedAt: number
  } | null>(null)
  const [spotlightRotation, setSpotlightRotation] = useState(0)
  const [audienceFeedCount, setAudienceFeedCount] = useState(3)
  const previousRanksRef = useRef<Record<string, number>>({})
  const previousEliminatedCountRef = useRef(0)
  const eliminatedIdsRef = useRef<Set<string>>(new Set())
  const completionFiredRef = useRef(false)
  const requestLockedRef = useRef(false)
  const mountedRef = useRef(true)
  const fastForwardButtonRef = useRef<HTMLButtonElement | null>(null)

  const effectiveEliminationIntervalMs = fastForwarding
    ? Math.min(configuredEliminationIntervalMs, FAST_FORWARD_ELIMINATION_INTERVAL_MS)
    : configuredEliminationIntervalMs

  const { votes, eliminated, winnerId, isComplete } = useBattleBackVoting({
    candidates: candidateIds,
    seed,
    eliminationIntervalMs: effectiveEliminationIntervalMs,
    tickIntervalMs: fastForwarding ? FAST_FORWARD_TICK_INTERVAL_MS : VOTE_TICK_INTERVAL_MS,
    driftAmount: fastForwarding ? 1.4 : 2.4,
    targetPercentages: forecast.targetPercentages,
  })
  const finaleAudienceFeed = useMemo(
    () =>
      mode === 'season_winner'
        ? buildFinaleAudienceFeed(
            candidates.map((candidate) => candidate.name),
            seed
          )
        : [],
    [candidates, mode, seed]
  )

  useEffect(() => {
    mountedRef.current = true
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    fastForwardButtonRef.current?.focus()
    return () => {
      mountedRef.current = false
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    if (isComplete) return
    const id = window.setInterval(() => setNowMs(Date.now()), CLOCK_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [isComplete])

  useEffect(() => {
    if (mode !== 'season_winner' || isComplete || finaleAudienceFeed.length === 0) return
    const id = window.setInterval(
      () =>
        setAudienceFeedCount((count) =>
          Math.min(finaleAudienceFeed.length, count + 1)
        ),
      fastForwarding ? 650 : 1700
    )
    return () => window.clearInterval(id)
  }, [fastForwarding, finaleAudienceFeed.length, isComplete, mode])

  useEffect(() => {
    if (isComplete) return
    setNextShiftAt(Date.now() + effectiveEliminationIntervalMs)
  }, [effectiveEliminationIntervalMs, eliminated.length, isComplete])

  useEffect(() => {
    if (eliminated.length <= previousEliminatedCountRef.current) {
      previousEliminatedCountRef.current = eliminated.length
      return
    }
    const eliminatedId = eliminated.at(-1)
    const player = eliminatedId ? candidatesById[eliminatedId] : undefined
    if (player) setEliminationMoment({ player, startedAt: Date.now() })
    previousEliminatedCountRef.current = eliminated.length
  }, [candidatesById, eliminated])

  useEffect(() => {
    if (!activeSpotlight) return
    if (activeSpotlight.endsAt <= nowMs || eliminated.includes(activeSpotlight.playerId)) {
      setActiveSpotlight(null)
    }
  }, [activeSpotlight, eliminated, nowMs])

  const activePlayers = useMemo(
    () => getActiveSpotlightPlayers(candidates, eliminated),
    [candidates, eliminated]
  )
  eliminatedIdsRef.current = new Set(eliminated)

  useEffect(() => {
    const firstActiveId = activePlayers[0]?.id ?? null
    if (!firstActiveId) {
      setSelectedPlayerId(null)
      return
    }
    if (!selectedPlayerId || eliminated.includes(selectedPlayerId)) {
      setSelectedPlayerId(firstActiveId)
    }
  }, [activePlayers, eliminated, selectedPlayerId])

  const spotlightItems = useMemo(() => buildHouseguestSpotlightItems(candidates), [candidates])
  const spotlight = useMemo(
    () => selectSpotlightItem(spotlightItems, spotlightRotation),
    [spotlightItems, spotlightRotation]
  )

  useEffect(() => {
    if (isComplete || !spotlight) return
    const id = window.setTimeout(() => {
      setSpotlightRotation((rotation) => {
        for (let offset = 1; offset <= spotlightItems.length; offset += 1) {
          const nextRotation = rotation + offset
          const nextPlayerId = selectSpotlightItem(spotlightItems, nextRotation)?.item.player.id
          if (nextPlayerId && !eliminatedIdsRef.current.has(nextPlayerId)) {
            return nextRotation
          }
        }
        return rotation
      })
    }, getSpotlightRotationDelayMs(spotlight.fact))
    return () => window.clearTimeout(id)
  }, [isComplete, spotlight, spotlightItems])

  const rankedPlayers = useMemo(
    () => [...activePlayers].sort((left, right) => (votes[right.id] ?? 0) - (votes[left.id] ?? 0)),
    [activePlayers, votes]
  )
  const voteEntries = useMemo<VoteEntry[]>(
    () =>
      rankedPlayers.map((player, index) => {
        const rank = index + 1
        const previousRank = previousRanksRef.current[player.id] ?? rank
        return {
          playerId: player.id,
          name: player.name,
          percent: votes[player.id] ?? 0,
          rank,
          previousRank,
          trend: voteTrend(previousRank, rank),
          isLeader: rank === 1,
          isSpotlighted: activeSpotlight?.playerId === player.id,
        }
      }),
    [activeSpotlight?.playerId, rankedPlayers, votes]
  )

  useEffect(() => {
    previousRanksRef.current = Object.fromEntries(
      rankedPlayers.map((player, index) => [player.id, index + 1])
    )
  }, [rankedPlayers])

  const elapsedMs = nowMs - mountedAt + introSkipBoostMs
  const eliminationActive =
    eliminationMoment && nowMs - eliminationMoment.startedAt < ELIMINATION_HOLD_MS
      ? eliminationMoment
      : null
  const finalTwoNames =
    activePlayers.length === 2 ? `${activePlayers[0].name} vs ${activePlayers[1].name}` : null
  const selectedPlayer = selectedPlayerId ? (candidatesById[selectedPlayerId] ?? null) : null
  const spotlightWindowRemaining = countdown(
    effectiveIntroMs + SPOTLIGHT_SELECTION_WINDOW_MS - elapsedMs
  )
  const canActivateSpotlight =
    !isComplete &&
    !spotlightUsed &&
    !spotlightPending &&
    elapsedMs >= effectiveIntroMs &&
    elapsedMs < effectiveIntroMs + SPOTLIGHT_SELECTION_WINDOW_MS
  const phase: PublicVotePhase = isComplete
    ? 'final_reveal'
    : elapsedMs < effectiveIntroMs
      ? 'intro'
      : eliminationActive
        ? 'elimination'
        : activePlayers.length === 2
          ? 'final_two'
          : 'live_results'
  const identitiesHidden =
    mode === 'season_winner' &&
    activePlayers.length === 2 &&
    elapsedMs < SEASON_WINNER_IDENTITY_REVEAL_MS

  const statusLine =
    phase === 'intro'
      ? 'Audience record is being verified'
      : identitiesHidden
        ? 'The vote is moving while both identities remain hidden'
        : phase === 'elimination'
            ? 'Standings paused for elimination'
            : phase === 'final_two'
              ? 'Every vote can still change who takes the crown'
              : canActivateSpotlight
                ? `Viewer Spotlight closes in ${spotlightWindowRemaining}s`
                : `Next result in ${countdown(nextShiftAt - nowMs)}s`
  const revealCountdown = isComplete
    ? 0
    : Math.max(
        1,
        countdown(
          Math.max(0, nextShiftAt - nowMs) +
            Math.max(0, activePlayers.length - 2) * effectiveEliminationIntervalMs
        )
      )
  const showFinalCountdown =
    mode === 'season_winner' && !isComplete && revealCountdown > 0 && revealCountdown <= 3

  const handleSkipIntro = useCallback(() => {
    const remaining = Math.max(0, effectiveIntroMs - elapsedMs)
    if (remaining <= 0) return
    setIntroSkipBoostMs((current) => current + remaining)
    setNowMs(Date.now())
  }, [effectiveIntroMs, elapsedMs])

  const handleFastForward = useCallback(() => {
    if (fastForwarding || isComplete || spotlightPending) return
    const remaining = Math.max(0, effectiveIntroMs - elapsedMs)
    if (remaining > 0) setIntroSkipBoostMs((current) => current + remaining)
    setFastForwarding(true)
    setNextShiftAt(Date.now() + FAST_FORWARD_ELIMINATION_INTERVAL_MS)
    setNowMs(Date.now())
  }, [effectiveIntroMs, elapsedMs, fastForwarding, isComplete, spotlightPending])

  const handleSpotlight = useCallback(async () => {
    if (
      !selectedPlayerId ||
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
        onAudienceSurgeRequest ? onAudienceSurgeRequest(selectedPlayerId) : true
      )
      if (!mountedRef.current || !granted) return
      setSpotlightUsed(true)
      setActiveSpotlight({
        playerId: selectedPlayerId,
        endsAt: Date.now() + SPOTLIGHT_DURATION_MS,
      })
    } catch {
      // A dismissed or unavailable rewarded placement leaves the option unused.
    } finally {
      requestLockedRef.current = false
      if (mountedRef.current) setSpotlightPending(false)
    }
  }, [
    canActivateSpotlight,
    onAudienceSurgeRequest,
    selectedPlayerId,
    spotlightPending,
    spotlightUsed,
  ])

  const resolvedWinnerId = winnerId ?? (isComplete ? forecast.winnerId : null)
  const winner = resolvedWinnerId ? candidatesById[resolvedWinnerId] : undefined
  const runnerUp =
    mode === 'season_winner' && winner
      ? candidates.find((candidate) => candidate.id !== winner.id)
      : undefined
  const handleClose = useCallback(() => {
    if (!resolvedWinnerId || completionFiredRef.current) return
    completionFiredRef.current = true
    onComplete(resolvedWinnerId)
  }, [onComplete, resolvedWinnerId])

  return (
    <MotionConfig reducedMotion={prefersReducedMotion ? 'always' : 'never'}>
      <div
        className={`pf-overlay${prefersReducedMotion ? ' pf-overlay--reduced-motion' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={
          mode === 'season_winner'
            ? 'Final public season winner vote'
            : `Public's Favorite Player overlay`
        }
      >
        <div className="pf-overlay__dim" aria-hidden="true" />
        <div className="pf-overlay__studio" aria-hidden="true" />
        <div className="pf-overlay__scanlines" aria-hidden="true" />
        <div className="pf-overlay__stage">
          {!isComplete && (
            <div className="pf-overlay__speed-controls" aria-label="Public vote playback controls">
              {phase === 'intro' && (
                <button type="button" className="pf-overlay__skip" onClick={handleSkipIntro}>
                  Skip intro
                </button>
              )}
              <button
                ref={fastForwardButtonRef}
                type="button"
                className={`pf-overlay__fast-forward${fastForwarding ? ' is-active' : ''}`}
                onClick={handleFastForward}
                disabled={fastForwarding || spotlightPending}
                aria-label="Fast forward public favorite vote"
              >
                <span aria-hidden="true">»</span>
                {fastForwarding ? 'Forwarding' : 'Fast forward'}
              </button>
            </div>
          )}

          {!isComplete && (
            <div className="pf-overlay__announcement-slot" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                {eliminationActive ? (
                  <motion.div
                    key={eliminationActive.player.id}
                    className="pf-overlay__elimination"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                  >
                    <span className="pf-overlay__elimination-label">Audience cut</span>
                    <strong className="pf-overlay__elimination-name">
                      {eliminationActive.player.name}
                    </strong>
                    <span className="pf-overlay__elimination-copy">leaves the public vote.</span>
                  </motion.div>
                ) : (
                  <header key="header" className="pf-overlay__header">
                    <div className="pf-overlay__header-topline">
                      <span className="pf-overlay__live-badge">
                        <span className="pf-overlay__live-dot" /> LIVE
                      </span>
                      <p className="pf-overlay__subtitle">
                        {mode === 'season_winner' ? 'The last vote of the season' : 'Season-long public vote'}
                      </p>
                    </div>
                    <div className="pf-overlay__header-copy">
                      <h2 className="pf-overlay__title">
                        {mode === 'season_winner' ? 'The Final Two Face the Public' : 'Public Favorite Player'}
                      </h2>
                      <p className="pf-overlay__status">{statusLine}</p>
                    </div>
                  </header>
                )}
              </AnimatePresence>
            </div>
          )}

          {!isComplete ? (
            <div className="pf-overlay__broadcast">
              <div className={`pf-overlay__board-shell pf-overlay__board-shell--${phase}`}>
                <HousemateSpotlight
                  spotlight={spotlight}
                  finalTwoNames={finalTwoNames}
                  revealCountdown={revealCountdown}
                  identitiesHidden={identitiesHidden}
                  showRevealCountdown={showFinalCountdown}
                />
                <VoteRankingBoard
                  entries={voteEntries}
                  candidatesById={candidatesById}
                  selectedPlayerId={selectedPlayerId}
                  onSelect={setSelectedPlayerId}
                  identitiesHidden={identitiesHidden}
                  anonymousLabelsById={anonymousLabelsById}
                />
                {mode === 'season_winner' && (
                  <FinaleAudienceFeed
                    items={finaleAudienceFeed.slice(
                      Math.max(0, audienceFeedCount - 5),
                      audienceFeedCount
                    )}
                  />
                )}
              </div>
              {!identitiesHidden && (
                <ViewerSpotlightPanel
                  selectedPlayer={selectedPlayer}
                  activeSpotlight={activeSpotlight}
                  used={spotlightUsed}
                  pending={spotlightPending}
                  canActivate={canActivateSpotlight}
                  onActivate={handleSpotlight}
                />
              )}
              <AnimatePresence>
                {phase === 'intro' && (
                  <motion.div
                    className="pf-overlay__intro"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span className="pf-overlay__intro-live">LIVE</span>
                    <p className="pf-overlay__intro-title">
                      {mode === 'season_winner' ? 'Final Public Vote' : 'Public Favorite Vote'}
                    </p>
                    <p className="pf-overlay__intro-subtitle">
                      {mode === 'season_winner'
                        ? 'The percentages go live first. Halfway through, the identities behind them will be revealed.'
                        : 'Season-long audience records are being verified.'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <FinalReveal
              winner={winner}
              runnerUp={runnerUp}
              awardAmount={awardAmount}
              mode={mode}
              onClose={handleClose}
            />
          )}
        </div>
      </div>
    </MotionConfig>
  )
}
