import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player } from '../../types'
import { resolveAvatar, resolveFormalCutout, resolveInformalCutout } from '../../utils/avatar'
import { HOUSEMATES_BIO_CARDS } from '../HousematesBioCinematic/housematesBioData'
import './VoxFinalistShowcase.css'

export interface VoxFinalistCase {
  player: Player
  introduction?: string
  powerMoves: string[]
}

interface Props {
  finalists: VoxFinalistCase[]
  onComplete: () => void
}

const SLIDE_MS = 3_200

export default function VoxFinalistShowcase({ finalists, onComplete }: Props) {
  const slides = useMemo(
    () => finalists.flatMap((entry) => [{ ...entry, kind: 'story' as const }, { ...entry, kind: 'case' as const }]),
    [finalists]
  )
  const [index, setIndex] = useState(0)
  const completedRef = useRef(false)
  const current = slides[index]

  useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(() => {
      if (index < slides.length - 1) {
        setIndex((value) => value + 1)
      } else if (!completedRef.current) {
        completedRef.current = true
        onComplete()
      }
    }, SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [current, index, onComplete, slides.length])

  if (!current) return null

  const bio = HOUSEMATES_BIO_CARDS.find(
    (card) => card.id.toLowerCase() === current.player.id.toLowerCase()
  )
  const portrait =
    current.kind === 'story'
      ? resolveInformalCutout(current.player) ?? resolveAvatar(current.player)
      : resolveFormalCutout(current.player) ?? resolveAvatar(current.player)

  const skip = () => {
    if (completedRef.current) return
    completedRef.current = true
    onComplete()
  }

  return (
    <div className="vox-finalist-showcase" role="dialog" aria-modal="true" aria-label="Meet the final two">
      <div className="vox-finalist-showcase__lights" aria-hidden="true" />
      <header className="vox-finalist-showcase__header">
        <span>Final Two • Closing Arguments</span>
        <button type="button" onClick={skip}>Skip presentation</button>
      </header>

      <AnimatePresence mode="wait">
        <motion.article
          className={`vox-finalist-showcase__slide vox-finalist-showcase__slide--${current.kind}`}
          key={`${current.player.id}-${current.kind}`}
          initial={{ opacity: 0, x: 34 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -34 }}
          transition={{ duration: 0.4 }}
        >
          <div className="vox-finalist-showcase__copy">
            <small>{current.kind === 'story' ? 'Their story' : 'Their road to the final'}</small>
            <h2>{current.player.name}</h2>
            {current.kind === 'story' ? (
              <p>{current.introduction ?? bio?.introduction ?? `${current.player.name} entered the house ready to be seen—and stayed long enough to make the audience listen.`}</p>
            ) : (
              <ul>
                {current.powerMoves.map((move) => <li key={move}>{move}</li>)}
              </ul>
            )}
          </div>
          <div className="vox-finalist-showcase__portrait">
            <span aria-hidden="true" />
            <img src={portrait} alt={current.player.name} />
          </div>
          <strong className="vox-finalist-showcase__vote-line">
            {current.kind === 'story' ? 'One last look at the journey.' : `Does ${current.player.name} deserve your vote?`}
          </strong>
        </motion.article>
      </AnimatePresence>

      <footer className="vox-finalist-showcase__progress" aria-label={`Presentation ${index + 1} of ${slides.length}`}>
        {slides.map((slide, slideIndex) => (
          <i key={`${slide.player.id}-${slide.kind}`} className={slideIndex <= index ? 'is-active' : ''} />
        ))}
      </footer>
    </div>
  )
}
