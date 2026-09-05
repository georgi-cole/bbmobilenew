import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'framer-motion'
import type { Player } from '../../types'
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage'
import { getDayStartShockObjectPronoun } from './dayStartShockCopy'
import './DayStartShockPopup.css'

interface DayStartShockPopupProps {
  player: Player
  reason: string
  onConfirm: () => void
}

/**
 * DayStartShockPopup — a dramatic morning removal order.
 *
 * The player is shown as a full-body cutout whenever one is available. The
 * confirmation hands control to the standard eviction cinematic; no game state
 * is committed from this presentation component itself.
 */
export default function DayStartShockPopup({ player, reason, onConfirm }: DayStartShockPopupProps) {
  const prefersReducedMotion = useReducedMotion()
  const objectPronoun = getDayStartShockObjectPronoun(player)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="day-start-shock" role="presentation" data-testid="day-start-shock-popup">
      <motion.div
        className="day-start-shock__backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.12 : 0.3, ease: 'easeOut' }}
      >
        <motion.section
          className="day-start-shock__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="day-start-shock-title"
          aria-describedby="day-start-shock-reason"
          initial={prefersReducedMotion ? { opacity: 0.96 } : { opacity: 0, scale: 0.9, y: 24 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0.96 } : { opacity: 0, scale: 0.95, y: 14 }}
          transition={{ duration: prefersReducedMotion ? 0.18 : 0.42, ease: [0.2, 0.9, 0.2, 1] }}
        >
          <div className="day-start-shock__scanlines" aria-hidden="true" />
          <div className="day-start-shock__alarm-bar" aria-hidden="true">
            <span />
            <strong>HOUSE ORDER</strong>
            <span />
          </div>

          <div className="day-start-shock__hero">
            <div className="day-start-shock__spotlight" aria-hidden="true" />
            <div className="day-start-shock__cutout-wrap">
              <FullSizeCutoutImage
                player={player}
                attire="informal"
                className="day-start-shock__cutout"
                alt={player.name}
              />
            </div>
            <div className="day-start-shock__stamp" aria-hidden="true">
              REMOVAL
            </div>
          </div>

          <div className="day-start-shock__content">
            <p className="day-start-shock__eyebrow">Morning shock</p>
            <h2 className="day-start-shock__title" id="day-start-shock-title">
              Pack your bags, {player.name}
            </h2>
            <p className="day-start-shock__subhead">
              Before the day can begin, The Big Eye has issued an immediate removal order.
            </p>
            <blockquote className="day-start-shock__reason" id="day-start-shock-reason">
              {reason}
            </blockquote>
            <button className="day-start-shock__confirm" type="button" onClick={onConfirm}>
              <span>Give {objectPronoun} the boot</span>
              <span className="day-start-shock__confirm-arrow" aria-hidden="true">
                →
              </span>
            </button>
          </div>
        </motion.section>
      </motion.div>
    </div>,
    document.body
  )
}
