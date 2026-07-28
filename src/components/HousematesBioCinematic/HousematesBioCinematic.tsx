import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { SoundManager } from '../../services/sound/SoundManager'
import {
  createCinematicAudio,
  type CinematicAudioController,
} from '../../services/sound/cinematicAudio'
import { HOUSEMATES_BIO_CARDS, type HousematesBioCard } from './housematesBioData'
import { getHousematesBioScene, HOUSEMATES_BIO_DURATION_MS } from './housematesBioTimeline'
import './HousematesBioCinematic.css'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

interface IntroHubAudioWindow extends Window {
  _introhubMusicOn?: boolean
}

function asset(path: string): string {
  return `${BASE}${path}`
}

function portraitSrc(card: HousematesBioCard): string {
  return asset(`/assets/Informal_attires/${card.portraitFile}`)
}

function backdropSrc(card: HousematesBioCard): string {
  return asset(`/assets/housemate-bio-backgrounds/${card.backdrop}.png`)
}

function IntroScene() {
  return (
    <motion.section
      className="hbc-intro"
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.p
        className="hbc-kicker"
        initial={{ opacity: 0, letterSpacing: '0.45em' }}
        animate={{ opacity: 1, letterSpacing: '0.28em' }}
        transition={{ delay: 0.18, duration: 0.8 }}
      >
        The Big Eye presents
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36, duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
      >
        Meet the Housemates
      </motion.h1>
      <motion.div
        className="hbc-intro__line"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.65, duration: 0.75 }}
        aria-hidden="true"
      />
      <motion.p
        className="hbc-intro__sub"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85, duration: 0.55 }}
      >
        22 lives. One house. One life-changing prize.
      </motion.p>
    </motion.section>
  )
}

function HousemateScene({ card, index }: { card: HousematesBioCard; index: number }) {
  const isEven = index % 2 === 0
  const style = {
    '--hbc-accent': card.accent,
    '--hbc-backdrop-position': `${36 + (index % 5) * 7}% center`,
  } as CSSProperties

  return (
    <motion.section
      className={`hbc-card${isEven ? '' : ' hbc-card--reverse'}`}
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.44 }}
    >
      <motion.div
        className="hbc-card__backdrop"
        style={{ backgroundImage: `url("${backdropSrc(card)}")` }}
        initial={{ scale: 1.075, x: isEven ? 12 : -12 }}
        animate={{ scale: 1.015, x: 0 }}
        transition={{ duration: 4.2, ease: 'linear' }}
        aria-hidden="true"
      />
      <div className="hbc-card__grade" aria-hidden="true" />
      <div className="hbc-card__ordinal" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </div>

      <motion.div
        className="hbc-card__portrait-wrap"
        initial={{ opacity: 0, x: isEven ? -58 : 58, y: 26 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="hbc-card__halo" aria-hidden="true" />
        <img
          className="hbc-card__portrait"
          src={portraitSrc(card)}
          alt={card.fullName}
          style={{ objectPosition: card.portraitPosition ?? 'center bottom' }}
          draggable={false}
        />
      </motion.div>

      <div className="hbc-card__copy">
        <motion.div
          className="hbc-card__identity"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.58 }}
        >
          <p className="hbc-card__eyebrow">
            Housemate {String(index + 1).padStart(2, '0')} / {HOUSEMATES_BIO_CARDS.length}
          </p>
          <h2>{card.name}</h2>
          <p className="hbc-card__details">
            {card.age} · {card.location} · {card.profession}
          </p>
        </motion.div>

        <motion.div
          className="hbc-bubble hbc-bubble--dream"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.58, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="hbc-bubble__label">Why I’m here</span>
          {card.prizePlan}
        </motion.div>
      </div>
    </motion.section>
  )
}

function OutroScene() {
  return (
    <motion.section
      className="hbc-ending hbc-ending--outro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
    >
      <motion.div
        className="hbc-ending__eye"
        initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.8, type: 'spring', bounce: 0.24 }}
        aria-hidden="true"
      >
        ◉
      </motion.div>
      <motion.p
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.65 }}
      >
        You can find more spicy details about the housemates through the IntroHub.
      </motion.p>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.35, duration: 0.6 }}
      >
        Open Housemates in the IntroHub to discover every full biography.
      </motion.span>
    </motion.section>
  )
}

function CreditScene() {
  return (
    <motion.section
      className="hbc-ending hbc-ending--credit"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.7 }}
    >
      <p className="hbc-kicker">Theme song</p>
      <h2>Midnight</h2>
      <p className="hbc-credit__artist">Jay Someday</p>
      <div className="hbc-credit__rule" aria-hidden="true" />
      <span>Housemates biography cinematic</span>
    </motion.section>
  )
}

function LogoScene() {
  return (
    <motion.section
      className="hbc-ending hbc-ending--logo"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.9 }}
    >
      <motion.div
        className="hbc-logo__glow"
        initial={{ opacity: 0, scale: 0.72 }}
        animate={{ opacity: [0, 0.72, 0.38], scale: [0.72, 1.12, 1] }}
        transition={{ duration: 2.8, ease: 'easeOut' }}
        aria-hidden="true"
      />
      <motion.img
        src={asset('/assets/kolequant.png')}
        alt="Kolequant"
        initial={{ opacity: 0, scale: 0.86, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ delay: 0.35, duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        transition={{ delay: 1.25, duration: 0.65 }}
      >
        The house is ready.
      </motion.p>
    </motion.section>
  )
}

export interface HousematesBioCinematicProps {
  onComplete: () => void
}

export default function HousematesBioCinematic({ onComplete }: HousematesBioCinematicProps) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const prefersReducedMotion = useReducedMotion()
  const onCompleteRef = useRef(onComplete)
  const completedRef = useRef(false)
  const audioRef = useRef<CinematicAudioController | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const scene = useMemo(() => getHousematesBioScene(elapsedMs), [elapsedMs])
  const progress = Math.min(1, elapsedMs / HOUSEMATES_BIO_DURATION_MS)
  const preloadFromIndex =
    scene.kind === 'housemate'
      ? scene.index
      : scene.kind === 'intro'
        ? -1
        : HOUSEMATES_BIO_CARDS.length

  const finish = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    audioRef.current?.fadeOutAndStop(550)
    onCompleteRef.current()
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    SoundManager.panicStopAllMusic()
    const audio = createCinematicAudio(asset('/assets/sounds/HousematesBio.mp4'), 0.78)
    audioRef.current = audio
    if ((window as IntroHubAudioWindow)._introhubMusicOn !== false) {
      audio.play()
    }

    const startedAt = performance.now()
    const interval = window.setInterval(() => {
      const nextElapsed = performance.now() - startedAt
      setElapsedMs(Math.min(HOUSEMATES_BIO_DURATION_MS, nextElapsed))
      if (nextElapsed >= HOUSEMATES_BIO_DURATION_MS) {
        window.clearInterval(interval)
        finish()
      }
    }, 80)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      audio.dispose()
      audioRef.current = null
      void SoundManager.syncMusic()
    }
  }, [finish])

  useEffect(() => {
    // Keep the next few cuts ready without downloading the full cinematic in
    // one burst. Repeated professional settings naturally reuse browser cache.
    const upcomingCards = HOUSEMATES_BIO_CARDS.slice(preloadFromIndex + 1, preloadFromIndex + 4)
    const sources = new Set<string>()
    upcomingCards.forEach((card) => {
      sources.add(portraitSrc(card))
      sources.add(backdropSrc(card))
    })
    sources.forEach((src) => {
      const image = new Image()
      image.decoding = 'async'
      image.src = src
    })
  }, [preloadFromIndex])

  useEffect(() => {
    if (scene.kind === 'logo') {
      audioRef.current?.fadeOutAndStop(3_600)
    }
  }, [scene.kind])

  return (
    <div
      className={`hbc${prefersReducedMotion ? ' hbc--reduced-motion' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Meet the Housemates cinematic"
    >
      <div className="hbc__ambient" aria-hidden="true" />
      <button
        ref={closeButtonRef}
        className="hbc__skip"
        type="button"
        onClick={finish}
        aria-label="Return to IntroHub"
      >
        <span>Skip</span>
        <span aria-hidden="true">×</span>
      </button>

      <div className="hbc__progress" aria-hidden="true">
        <motion.div
          animate={{ scaleX: progress }}
          transition={{ duration: 0.08, ease: 'linear' }}
        />
      </div>

      <main className="hbc__stage" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={scene.key}
            className="hbc__scene-shell"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.34 }}
          >
            {scene.kind === 'intro' && <IntroScene />}
            {scene.kind === 'housemate' && <HousemateScene card={scene.card} index={scene.index} />}
            {scene.kind === 'outro' && <OutroScene />}
            {scene.kind === 'credit' && <CreditScene />}
            {scene.kind === 'logo' && <LogoScene />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
