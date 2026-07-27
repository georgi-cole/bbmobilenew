import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import type { Player } from '../../types'
import type { PublicOpinionState } from '../../publicOpinion/types'
import { resolveAvatarCandidates } from '../../utils/avatar'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import EvictionLadder from './EvictionLadder'
import {
  buildSeasonRecapData,
  deriveEvictionFallbackPlacement,
  type AwardCategory,
} from './seasonRecapData'
import { buildSeasonRecapHighlights, type SeasonRecapHighlight } from './seasonRecapHighlights'
import type { EvictionLadderEntry } from './evictionLadderModel'
import {
  buildSeasonRecapTimeline,
  RECAP_EXIT_FADE_MS,
  type RecapTimelineScene,
} from './seasonRecapTimeline'
import './SeasonRecapCinematic.css'
import './SeasonRecapProfessional.css'

export interface SeasonRecapProps {
  season: number
  week: number
  players: Player[]
  publicOpinion?: PublicOpinionState | null
  onComplete: () => void
}

const INTRO_COPY: Record<string, { line: string; lines?: string[] }> = {
  intro_votes_in: { line: 'THE VOTES ARE IN.' },
  intro_before_final_word: {
    line: 'BUT BEFORE THE FINAL WORD…',
    lines: ['BUT BEFORE', 'THE FINAL WORD…'],
  },
}

const LADDER_ARCHIVE_LIMIT = 6
const FINALISTS_RANK_OFFSET = 2
const DICEBEAR_HOST = 'api.dicebear.com'
const URL_PARSE_BASE = 'https://bbmobilenew.local'

function isDicebearAvatar(candidate: string): boolean {
  try {
    return new URL(candidate, URL_PARSE_BASE).hostname === DICEBEAR_HOST
  } catch {
    return false
  }
}

function resolveRecapAvatarUrl(player: Player): string | undefined {
  const candidates = resolveAvatarCandidates(player)
  return candidates.find((candidate) => !isDicebearAvatar(candidate)) ?? candidates[0]
}

function toEvictionLadderEntry(player: Player, fallbackPlacement: number): EvictionLadderEntry {
  const rank = player.seasonPlacement ?? player.finalRank ?? fallbackPlacement
  const status = player.isWinner || rank === 1 ? 'winner' : rank <= 3 ? 'finalist' : 'evicted'

  return {
    id: player.id,
    name: player.name,
    rank,
    avatarUrl: resolveRecapAvatarUrl(player),
    status,
  }
}

function SceneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      className={['src-scene', className].filter(Boolean).join(' ')}
      initial={{ opacity: 0, y: 18, scale: 1.012 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -14, scale: 0.994 }}
      transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  )
}

function IntroScene({ scene }: { scene: RecapTimelineScene }) {
  const copy = INTRO_COPY[scene.id]
  if (!copy) return null

  return (
    <SceneFrame className={`src-scene--intro src-scene--${scene.id}`}>
      <div className="src-intro-content">
        {copy.lines ? (
          <div className="src-intro-line-stack">
            {copy.lines.map((line, index) => (
              <motion.p
                key={line}
                className="src-intro-line src-intro-line--stacked"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.65,
                  delay: 0.35 + index * 0.34,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {line}
              </motion.p>
            ))}
          </div>
        ) : (
          <motion.p
            className="src-intro-line"
            initial={{ opacity: 0, scale: 1.04, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.72, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {copy.line}
          </motion.p>
        )}
        <div className="src-intro-rule" aria-hidden="true" />
      </div>
    </SceneFrame>
  )
}

function RecapAvatar({ player }: { player: Player }) {
  const sources = useMemo(() => resolveAvatarCandidates(player), [player])
  const [sourceIndex, setSourceIndex] = useState(0)
  const source = sources[sourceIndex]

  return (
    <div className="src-cast-card__avatar">
      {source ? (
        <img
          src={source}
          alt=""
          loading="eager"
          decoding="async"
          onError={() => setSourceIndex((index) => index + 1)}
        />
      ) : (
        <span aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  )
}

function CastOverviewScene({
  season,
  week,
  players,
}: {
  season: number
  week: number
  players: Player[]
}) {
  const orderedPlayers = useMemo(
    () =>
      [...players].sort((left, right) => {
        const leftFinalist =
          left.status === 'active' || left.status === 'loh' || left.status === 'pos'
        const rightFinalist =
          right.status === 'active' || right.status === 'loh' || right.status === 'pos'
        if (leftFinalist !== rightFinalist) return leftFinalist ? -1 : 1
        const leftPlacement = left.seasonPlacement ?? left.finalRank ?? Number.MAX_SAFE_INTEGER
        const rightPlacement = right.seasonPlacement ?? right.finalRank ?? Number.MAX_SAFE_INTEGER
        return leftPlacement - rightPlacement || left.name.localeCompare(right.name)
      }),
    [players]
  )

  return (
    <SceneFrame className="src-scene--cast-overview">
      <div className="src-cast-heading">
        <p>
          Season {season} · Through week {week}
        </p>
        <h2>The Housemates</h2>
        <span>{players.length} stories entered the house.</span>
      </div>
      <div className="src-cast-grid" role="list" aria-label={`Season ${season} housemates`}>
        {orderedPlayers.map((player, index) => (
          <motion.div
            key={player.id}
            className="src-cast-card"
            role="listitem"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.38,
              delay: Math.min(1.6, 0.2 + index * 0.055),
            }}
          >
            <RecapAvatar player={player} />
            <span>{player.name}</span>
          </motion.div>
        ))}
      </div>
    </SceneFrame>
  )
}

function HighlightMomentScene({ highlight }: { highlight: SeasonRecapHighlight }) {
  return (
    <SceneFrame className="src-scene--actual-highlight">
      <div className="src-actual-highlight__backdrop" aria-hidden="true" />
      <motion.div
        className="src-actual-highlight__portrait"
        initial={{ opacity: 0, x: -28, scale: 1.04 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.78, ease: [0.22, 1, 0.36, 1] }}
      >
        <FullSizeCutoutImage
          player={highlight.player}
          alt={highlight.player.name}
          className="src-actual-highlight__cutout"
          loading="eager"
        />
      </motion.div>
      <motion.div
        className="src-actual-highlight__copy"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.58, delay: 0.48 }}
      >
        <p>{highlight.eyebrow}</p>
        <h2>{highlight.title}</h2>
        <span>{highlight.caption}</span>
        <strong>{highlight.stamp}</strong>
      </motion.div>
    </SceneFrame>
  )
}

function CategoryScene({ category }: { category: AwardCategory }) {
  return (
    <SceneFrame className={`src-scene--category src-scene--category-${category.visualVariant}`}>
      <div
        className="src-category-bg"
        aria-hidden="true"
        style={
          {
            '--category-accent': category.accentColor,
            '--category-glow': category.accentGlow,
            '--category-gradient': category.bgGradient,
          } as CSSProperties
        }
      />
      <div className="src-category-header">
        <motion.p
          className="src-category-eyebrow"
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          Season honor · Verified record
        </motion.p>
        <motion.span
          className="src-category-emoji"
          initial={{ opacity: 0, scale: 0.78 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.38, delay: 0.18 }}
          aria-hidden="true"
        >
          {category.emoji}
        </motion.span>
        <motion.h2
          className="src-category-title"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.58, ease: [0.22, 1, 0.36, 1] }}
        >
          {category.name}
        </motion.h2>
        <motion.p
          className="src-category-subtitle"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 1.05 }}
        >
          {category.subtitle}
        </motion.p>
      </div>

      <motion.div
        className="src-category-stage"
        initial={{ opacity: 0, y: 28, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.82, delay: 1.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="src-category-bloom" aria-hidden="true" />
        <div className="src-category-rim" aria-hidden="true" />
        <div className="src-category-floor" aria-hidden="true" />
        <FullSizeCutoutImage
          player={category.winner}
          alt={category.winner.name}
          className="src-category-cutout"
          loading="eager"
        />
      </motion.div>

      <motion.div
        className="src-category-plaque"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 2.15 }}
      >
        <span className="src-category-plaque__name">{category.winner.name}</span>
        <span className="src-category-plaque__stat">{category.winnerStat}</span>
      </motion.div>
    </SceneFrame>
  )
}

function LadderIntroScene({ archivePlayers }: { archivePlayers: Player[] }) {
  return (
    <SceneFrame className="src-scene--ladder-intro">
      <div className="src-ladder-archive" aria-hidden="true">
        {archivePlayers.map((player) => (
          <span key={player.id} className="src-ladder-archive__chip">
            {player.name}
          </span>
        ))}
      </div>
      <div className="src-ladder-copy">
        <p className="src-ladder-copy__eyebrow">ROAD TO THE FINALISTS</p>
        <h2 className="src-ladder-copy__title">ONE BY ONE…</h2>
      </div>
    </SceneFrame>
  )
}

function LadderWaveScene({
  players,
  ladder,
  caption,
}: {
  players: Player[]
  ladder: Player[]
  caption: string
}) {
  const ladderIndexesById = new Map(ladder.map((player, index) => [player.id, index]))
  const entries = players.map((player) => {
    const ladderIndex = ladderIndexesById.get(player.id)
    const fallbackPlacement =
      ladderIndex != null
        ? deriveEvictionFallbackPlacement(ladder.length, ladderIndex)
        : players.length + FINALISTS_RANK_OFFSET
    return toEvictionLadderEntry(player, fallbackPlacement)
  })

  return (
    <SceneFrame className="src-scene--ladder-wave">
      <EvictionLadder
        entries={entries}
        caption={caption}
        compact={entries.length >= 6}
        animationDelayMs={180}
        stepDelayMs={330}
      />
    </SceneFrame>
  )
}

function MomentOfTruthScene({ finalists }: { finalists: Player[] }) {
  return (
    <SceneFrame className="src-scene--moment-of-truth">
      <motion.p
        className="src-mot-eyebrow"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.18 }}
      >
        AND NOW THE MOMENT OF TRUTH
      </motion.p>
      <p className="src-mot-subtitle">The season ends where the final decision begins.</p>
      <div className="src-finalists-equal">
        {finalists.map((player) => (
          <div key={player.id} className="src-finalists-equal__card">
            <FullSizeCutoutImage
              player={player}
              alt={player.name}
              className="src-finalists-equal__image"
            />
            <span className="src-finalists-equal__name">{player.name}</span>
          </div>
        ))}
      </div>
    </SceneFrame>
  )
}

export default function SeasonRecapCinematic({
  season,
  week,
  players,
  publicOpinion,
  onComplete,
}: SeasonRecapProps) {
  const prefersReducedMotion = useReducedMotion()
  const noAnimations =
    typeof document !== 'undefined' && document.body.classList.contains('no-animations')
  const reducedMotion = Boolean(prefersReducedMotion || noAnimations)

  const recapData = useMemo(
    () => buildSeasonRecapData(players, week, publicOpinion),
    [players, publicOpinion, week]
  )
  const highlights = useMemo(
    () => buildSeasonRecapHighlights(players, publicOpinion, 3),
    [players, publicOpinion]
  )
  const timeline = useMemo(
    () =>
      buildSeasonRecapTimeline(
        recapData.categories.map((category) => category.id),
        recapData.evictionWaves.length,
        highlights.length
      ),
    [highlights.length, recapData.categories, recapData.evictionWaves.length]
  )

  const [sceneIndex, setSceneIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const didFinishRef = useRef(false)
  const finishTimeoutRef = useRef<number | null>(null)
  const skipButtonRef = useRef<HTMLButtonElement | null>(null)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const finish = useCallback(() => {
    if (didFinishRef.current) return
    didFinishRef.current = true
    setVisible(false)
    finishTimeoutRef.current = window.setTimeout(
      () => onCompleteRef.current(),
      reducedMotion ? 0 : RECAP_EXIT_FADE_MS
    )
  }, [reducedMotion])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    skipButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      if (finishTimeoutRef.current != null) window.clearTimeout(finishTimeoutRef.current)
    }
  }, [finish])

  useEffect(() => {
    if (sceneIndex >= timeline.length) {
      const timer = window.setTimeout(() => finish(), 0)
      return () => window.clearTimeout(timer)
    }

    const timer = window.setTimeout(() => {
      setSceneIndex((current) => current + 1)
    }, timeline[sceneIndex].durationMs)
    return () => window.clearTimeout(timer)
  }, [finish, sceneIndex, timeline])

  const currentScene = timeline[sceneIndex]
  const activeCategory =
    currentScene?.kind === 'category'
      ? recapData.categories.find((category) => category.id === currentScene.categoryId)
      : null
  const activeWave =
    currentScene?.kind === 'ladder_wave'
      ? recapData.evictionWaves[currentScene.ladderWaveIndex ?? 0]
      : null
  const activeHighlight =
    currentScene?.kind === 'highlight_moment' ? highlights[currentScene.highlightIndex ?? 0] : null
  const sceneProgress = timeline.length > 0 ? Math.min(1, (sceneIndex + 1) / timeline.length) : 0
  const chapterLabel =
    currentScene?.kind === 'category'
      ? 'Season honors'
      : currentScene?.kind === 'ladder_intro' || currentScene?.kind === 'ladder_wave'
        ? 'Road to the final two'
        : currentScene?.kind === 'moment_of_truth'
          ? 'The final two'
          : currentScene?.kind === 'highlight_moment'
            ? 'Season headlines'
            : currentScene?.kind === 'cast_overview'
              ? 'The housemates'
              : 'Season archive'

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <motion.div
        className={`src-overlay${reducedMotion ? ' src-overlay--reduced-motion' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Season recap cinematic"
        data-season={season}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.45 }}
      >
        <div className="src-overlay-bg" aria-hidden="true" />
        <div className="src-vignette" aria-hidden="true" />
        <div className="src-archive-lines" aria-hidden="true" />
        <div className="src-particles" aria-hidden="true">
          {Array.from({ length: reducedMotion ? 0 : 12 }).map((_, index) => (
            <span key={index} className={`src-particle src-particle--${(index % 6) + 1}`} />
          ))}
        </div>

        {visible && (
          <button
            ref={skipButtonRef}
            type="button"
            className="src-skip-btn"
            onClick={finish}
            aria-label="Skip recap"
          >
            Skip recap
          </button>
        )}

        <div className="src-archive-header" aria-hidden="true">
          <span>Season {season} archive</span>
          <strong>{chapterLabel}</strong>
          <small>
            {String(Math.min(sceneIndex + 1, timeline.length)).padStart(2, '0')} /{' '}
            {String(timeline.length).padStart(2, '0')}
          </small>
        </div>
        <div className="src-archive-progress" aria-hidden="true">
          <motion.span
            animate={{ scaleX: sceneProgress }}
            transition={{ duration: reducedMotion ? 0 : 0.3 }}
          />
        </div>

        <AnimatePresence mode="wait">
          {currentScene?.kind === 'intro' && (
            <IntroScene key={currentScene.id} scene={currentScene} />
          )}
          {currentScene?.kind === 'cast_overview' && (
            <CastOverviewScene
              key={currentScene.id}
              season={season}
              week={week}
              players={players}
            />
          )}
          {currentScene?.kind === 'highlight_moment' && activeHighlight && (
            <HighlightMomentScene key={currentScene.id} highlight={activeHighlight} />
          )}
          {currentScene?.kind === 'category' && activeCategory && (
            <CategoryScene key={currentScene.id} category={activeCategory} />
          )}
          {currentScene?.kind === 'ladder_intro' && (
            <LadderIntroScene
              key={currentScene.id}
              archivePlayers={recapData.evictionLadder.slice(0, LADDER_ARCHIVE_LIMIT)}
            />
          )}
          {currentScene?.kind === 'ladder_wave' && activeWave && (
            <LadderWaveScene
              key={currentScene.id}
              players={activeWave.players}
              ladder={recapData.evictionLadder}
              caption={activeWave.caption}
            />
          )}
          {currentScene?.kind === 'moment_of_truth' && (
            <MomentOfTruthScene key={currentScene.id} finalists={recapData.finalists} />
          )}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  )
}
