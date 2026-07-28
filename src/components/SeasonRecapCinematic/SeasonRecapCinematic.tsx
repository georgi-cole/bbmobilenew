import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'framer-motion'
import type { PublicOpinionState } from '../../publicOpinion/types'
import type { Player } from '../../types'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import { buildSeasonRecapData, type AwardCategory } from './seasonRecapData'
import { buildSeasonRecapHighlights, type SeasonRecapHighlight } from './seasonRecapHighlights'
import {
  buildSeasonRecapTimeline,
  RECAP_EXIT_FADE_MS,
  type RecapTimelineScene,
} from './seasonRecapTimeline'
import './SeasonRecapBroadcast.css'

export interface SeasonRecapProps {
  season: number
  week: number
  players: Player[]
  publicOpinion?: PublicOpinionState | null
  onComplete: () => void
}

const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL.slice(0, -1)
  : import.meta.env.BASE_URL
const GIRLS_PHOTOSHOOT = `${BASE}/assets/skins/thegirls.webp`
const BOYS_PHOTOSHOOT = `${BASE}/assets/skins/the%20boys.webp`
const HONOR_PRIORITY: AwardCategory['id'][] = [
  'vibe_curator',
  'compzilla',
  'head_honcho',
  'mess_factory',
  'ghost_mode',
  'heat_magnet',
]

const INTRO_COPY: Record<string, { line: string; lines?: string[] }> = {
  intro_votes_in: { line: 'THE VOTES ARE IN.' },
  intro_before_final_word: {
    line: 'BUT BEFORE THE FINAL WORD…',
    lines: ['BUT BEFORE', 'THE FINAL WORD…'],
  },
}

const HONOR_COPY: Record<
  AwardCategory['id'],
  { title: string; subtitle: string; eyebrow: string }
> = {
  vibe_curator: {
    eyebrow: 'The housemate the season embraced',
    title: 'The Season Favorite',
    subtitle: 'Some people play the game. Some people become part of its identity.',
  },
  compzilla: {
    eyebrow: 'When the pressure was highest',
    title: 'The Competitor',
    subtitle: 'The biggest moments kept bringing out another level.',
  },
  head_honcho: {
    eyebrow: 'Power suited them',
    title: 'The Power Player',
    subtitle: 'When control changed hands, they made the house feel different.',
  },
  mess_factory: {
    eyebrow: 'The door kept calling',
    title: 'The Survivor',
    subtitle: 'The block became familiar. Leaving never did.',
  },
  ghost_mode: {
    eyebrow: 'Danger kept passing by',
    title: 'The Escape Artist',
    subtitle: 'They stayed in the story without becoming the obvious target.',
  },
  heat_magnet: {
    eyebrow: 'Nobody looked away',
    title: 'The Firestarter',
    subtitle: 'Love them or question them, the room always changed when they entered it.',
  },
}

function SceneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.section
      className={['src-broadcast-scene', className].filter(Boolean).join(' ')}
      initial={{ opacity: 0, scale: 1.018 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.992 }}
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
    <SceneFrame className="src-broadcast-intro">
      <div className="src-broadcast-intro__glow" aria-hidden="true" />
      <div className="src-broadcast-intro__copy">
        {(copy.lines ?? [copy.line]).map((line, index) => (
          <motion.p
            key={line}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.62, delay: 0.2 + index * 0.28 }}
          >
            {line}
          </motion.p>
        ))}
        <span aria-hidden="true" />
      </div>
    </SceneFrame>
  )
}

function PhotoshootScene({
  season,
  week,
  reducedMotion,
}: {
  season: number
  week: number
  reducedMotion: boolean
}) {
  const [activePhoto, setActivePhoto] = useState(0)
  const photos = [
    { src: GIRLS_PHOTOSHOOT, alt: 'Season housemates photoshoot' },
    { src: BOYS_PHOTOSHOOT, alt: 'Season housemates photoshoot' },
  ]

  useEffect(() => {
    const timer = window.setTimeout(() => setActivePhoto(1), reducedMotion ? 3_600 : 3_350)
    return () => window.clearTimeout(timer)
  }, [reducedMotion])

  return (
    <SceneFrame className="src-broadcast-photoshoot">
      <div className="src-broadcast-photoshoot__frame">
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={photos[activePhoto]?.src}
            src={photos[activePhoto]?.src}
            alt={photos[activePhoto]?.alt}
            initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.025 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.99 }}
            transition={{
              duration: reducedMotion ? 0 : 0.62,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        </AnimatePresence>
        <div className="src-broadcast-photoshoot__wash" aria-hidden="true" />
      </div>
      <div className="src-broadcast-photoshoot__copy">
        <p>
          Season {season} · Week {week}
        </p>
        <h2>The housemates who made the season.</h2>
      </div>
    </SceneFrame>
  )
}

function HighlightScene({ highlight }: { highlight: SeasonRecapHighlight }) {
  return (
    <SceneFrame
      className={`src-broadcast-highlight src-broadcast-highlight--${highlight.storyType}`}
    >
      <div className="src-broadcast-highlight__light" aria-hidden="true" />
      <motion.div
        className="src-broadcast-highlight__portrait"
        initial={{ opacity: 0, x: -26 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
      >
        <FullSizeCutoutImage
          player={highlight.player}
          alt={highlight.player.name}
          className="src-broadcast-highlight__cutout"
          loading="eager"
        />
      </motion.div>
      <motion.div
        className="src-broadcast-highlight__copy"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.58, delay: 0.34 }}
      >
        <p>{highlight.eyebrow}</p>
        <h2>{highlight.title}</h2>
        <blockquote>{highlight.caption}</blockquote>
        <span>{highlight.stamp}</span>
      </motion.div>
    </SceneFrame>
  )
}

function HonorScene({ category }: { category: AwardCategory }) {
  const copy = HONOR_COPY[category.id]

  return (
    <SceneFrame className={`src-broadcast-honor src-broadcast-honor--${category.id}`}>
      <div
        className="src-broadcast-honor__background"
        style={{ background: category.bgGradient }}
        aria-hidden="true"
      />
      <div
        className="src-broadcast-honor__glow"
        style={{ background: category.accentGlow }}
        aria-hidden="true"
      />
      <motion.div
        className="src-broadcast-honor__portrait"
        initial={{ opacity: 0, y: 24, scale: 1.03 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.82, ease: [0.22, 1, 0.36, 1] }}
      >
        <FullSizeCutoutImage
          player={category.winner}
          alt={category.winner.name}
          className="src-broadcast-honor__cutout"
          loading="eager"
        />
      </motion.div>
      <motion.div
        className="src-broadcast-honor__copy"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.58, delay: 0.42 }}
      >
        <p>{copy.eyebrow}</p>
        <h2>{copy.title}</h2>
        <strong>{category.winner.name}</strong>
        <span>{copy.subtitle}</span>
      </motion.div>
    </SceneFrame>
  )
}

function FarewellScene({
  players,
  index,
  total,
}: {
  players: Player[]
  index: number
  total: number
}) {
  const closing = index === total - 1

  return (
    <SceneFrame className="src-broadcast-farewell">
      <div className="src-broadcast-farewell__grain" aria-hidden="true" />
      <div className="src-broadcast-farewell__heading">
        <p>{closing ? 'Until only two remained' : 'One by one, the house said goodbye'}</p>
        <h2>{closing ? 'The final goodbyes.' : 'They left their mark.'}</h2>
      </div>
      <div
        className={`src-broadcast-farewell__lineup src-broadcast-farewell__lineup--${players.length}`}
      >
        {players.map((player, playerIndex) => (
          <motion.div
            key={player.id}
            className="src-broadcast-farewell__person"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.52, delay: 0.12 + playerIndex * 0.12 }}
          >
            <FullSizeCutoutImage
              player={player}
              alt={player.name}
              className="src-broadcast-farewell__cutout"
              loading="eager"
            />
            <span>{player.name}</span>
          </motion.div>
        ))}
      </div>
    </SceneFrame>
  )
}

function MomentOfTruthScene({ finalists }: { finalists: Player[] }) {
  return (
    <SceneFrame className="src-broadcast-finalists">
      <div className="src-broadcast-finalists__copy">
        <p>And now, the final word</p>
        <h2>The season belongs to one of them.</h2>
      </div>
      <div className="src-broadcast-finalists__stage">
        {finalists.map((player, index) => (
          <motion.div
            key={player.id}
            className="src-broadcast-finalists__person"
            initial={{ opacity: 0, x: index === 0 ? -30 : 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.72, delay: 0.18 + index * 0.18 }}
          >
            <FullSizeCutoutImage
              player={player}
              alt={player.name}
              className="src-broadcast-finalists__cutout"
            />
            <span>{player.name}</span>
          </motion.div>
        ))}
      </div>
    </SceneFrame>
  )
}

function selectBroadcastHonors(categories: AwardCategory[]): AwardCategory[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const selected: AwardCategory[] = []
  const usedWinnerIds = new Set<string>()

  for (const id of HONOR_PRIORITY) {
    const category = categoryById.get(id)
    if (!category || usedWinnerIds.has(category.winner.id)) continue
    selected.push(category)
    usedWinnerIds.add(category.winner.id)
    if (selected.length === 3) break
  }

  return selected
}

function buildFarewellGroups(players: Player[]): Player[][] {
  if (players.length === 0) return []
  const groupCount = Math.min(4, Math.max(1, Math.ceil(players.length / 5)))
  const groupSize = Math.ceil(players.length / groupCount)
  const groups: Player[][] = []

  for (let index = 0; index < players.length; index += groupSize) {
    groups.push(players.slice(index, index + groupSize))
  }

  return groups
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
    () => buildSeasonRecapHighlights(players, publicOpinion, 2),
    [players, publicOpinion]
  )
  const honors = useMemo(() => selectBroadcastHonors(recapData.categories), [recapData.categories])
  const farewellGroups = useMemo(
    () => buildFarewellGroups(recapData.evictionLadder),
    [recapData.evictionLadder]
  )
  const timeline = useMemo(
    () => buildSeasonRecapTimeline(honors.length, farewellGroups.length, highlights.length),
    [farewellGroups.length, highlights.length, honors.length]
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
  const activeHighlight =
    currentScene?.kind === 'highlight_moment' ? highlights[currentScene.highlightIndex ?? 0] : null
  const activeHonor = currentScene?.kind === 'honor' ? honors[currentScene.honorIndex ?? 0] : null
  const activeFarewell =
    currentScene?.kind === 'farewell' ? farewellGroups[currentScene.farewellIndex ?? 0] : null

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      <motion.div
        className={`src-broadcast-overlay${reducedMotion ? ' src-broadcast-overlay--reduced-motion' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Season recap cinematic"
        data-season={season}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.45 }}
      >
        <div className="src-broadcast-overlay__background" aria-hidden="true" />
        <div className="src-broadcast-overlay__vignette" aria-hidden="true" />

        <div className="src-broadcast-bug" aria-hidden="true">
          <span>Season {season}</span>
          <strong>Finale</strong>
        </div>

        {visible && (
          <button
            ref={skipButtonRef}
            type="button"
            className="src-broadcast-skip"
            onClick={finish}
            aria-label="Skip recap"
          >
            Skip
          </button>
        )}

        <AnimatePresence mode="wait">
          {currentScene?.kind === 'intro' && (
            <IntroScene key={currentScene.id} scene={currentScene} />
          )}
          {currentScene?.kind === 'photoshoot' && (
            <PhotoshootScene
              key={currentScene.id}
              season={season}
              week={week}
              reducedMotion={reducedMotion}
            />
          )}
          {currentScene?.kind === 'highlight_moment' && activeHighlight && (
            <HighlightScene key={currentScene.id} highlight={activeHighlight} />
          )}
          {currentScene?.kind === 'honor' && activeHonor && (
            <HonorScene key={currentScene.id} category={activeHonor} />
          )}
          {currentScene?.kind === 'farewell' && activeFarewell && (
            <FarewellScene
              key={currentScene.id}
              players={activeFarewell}
              index={currentScene.farewellIndex ?? 0}
              total={farewellGroups.length}
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
