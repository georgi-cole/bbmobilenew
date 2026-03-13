/**
 * JuryPhaseRevealOverlay — cinematic full-screen overlay for the Final 3 → Jury transition.
 *
 * Staged animation sequence (animated path):
 *   Stage 1  backdrop      Full-screen dark overlay fades in (~400 ms).
 *   Stage 2  opening_line  "The power shifts…" fades in, holds, then fades out.
 *   Stage 3  jurors        Juror avatars ignite one by one (staggered).
 *   Stage 4  title_card    Premium title card rises from lower-middle.
 *   Stage 5  actions       "Enter Jury Vote" and "Spy Jury" buttons appear.
 *
 * Reduced-motion / no-animations fast-path: skips directly to the final state
 * (all jurors visible, card and actions shown without animation).
 *
 * Timing constants are centralised below for easy tuning.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Player } from '../../types'
import { resolveAvatarCandidates, isEmoji } from '../../utils/avatar'
import './JuryPhaseRevealOverlay.css'

// ── Timing constants (ms) ─────────────────────────────────────────────────────
/** How long after mount before the opening line appears. */
const BACKDROP_SETTLE_MS = 400
/** How long the opening line stays fully visible. */
const OPENING_LINE_VISIBLE_MS = 1000
/** Gap between opening-line fade-out and the first juror igniting. */
const OPENING_LINE_FADE_MS = 300
/** Delay between each juror avatar igniting (staggered). */
const JUROR_STAGGER_MS = 150
/** Hold time after all jurors are lit before the title card rises. */
const JURORS_HOLD_MS = 700
/** Duration of the title card rise animation (matches CSS). */
const TITLE_CARD_SETTLE_MS = 450
/** Delay after the title card settles before action buttons appear. */
const ACTIONS_REVEAL_DELAY_MS = 350
/** How long the "coming soon" hint under Spy Jury stays visible (ms). */
const SPY_JURY_HINT_MS = 1800

// ── Types ─────────────────────────────────────────────────────────────────────
type OverlayStage = 'idle' | 'backdrop' | 'opening_line' | 'jurors' | 'title_card' | 'actions'

interface Props {
  /** Whether the overlay is visible and playing. */
  open: boolean
  /** The evicted houseguests who now form the jury. */
  jurors: Player[]
  /** Called when the user explicitly taps "Enter Jury Vote". */
  onEnterVote: () => void
  /** Called when the user taps "Spy Jury". */
  onSpyJury?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function JuryPhaseRevealOverlay({ open, jurors, onEnterVote, onSpyJury }: Props) {
  const [stage, setStage] = useState<OverlayStage>('idle')
  const [visibleJurorCount, setVisibleJurorCount] = useState(0)
  const [showOpeningLine, setShowOpeningLine] = useState(false)
  const [showSpyHint, setShowSpyHint] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  const noAnimations =
    typeof document !== 'undefined' && !!document.body
      ? document.body.classList.contains('no-animations')
      : false

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  /** Jump immediately to the fully-assembled final state (no animation). */
  const skipToFinal = useCallback(
    (jurorCount: number) => {
      clearTimers()
      setShowOpeningLine(false)
      setVisibleJurorCount(jurorCount)
      setStage('actions')
    },
    [clearTimers],
  )

  // Auto-dismiss the Spy Jury hint after a brief delay.
  useEffect(() => {
    if (!showSpyHint) return
    const id = setTimeout(() => setShowSpyHint(false), SPY_JURY_HINT_MS)
    return () => clearTimeout(id)
  }, [showSpyHint])

  const handleSpyJury = useCallback(() => {
    setShowSpyHint(true)
    onSpyJury?.()
  }, [onSpyJury])

  // Drive the staged sequence when the overlay opens / closes.
  useEffect(() => {
    if (!open) {
      clearTimers()
      setStage('idle')
      setVisibleJurorCount(0)
      setShowOpeningLine(false)
      return
    }

    if (noAnimations || prefersReducedMotion) {
      skipToFinal(jurors.length)
      return
    }

    // ── Animated sequence ──────────────────────────────────────────────────
    const push = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay)
      timersRef.current.push(id)
    }

    // Stage 1: backdrop
    setStage('backdrop')
    setVisibleJurorCount(0)
    setShowOpeningLine(false)

    // Stage 2: opening line
    push(() => {
      setStage('opening_line')
      setShowOpeningLine(true)
    }, BACKDROP_SETTLE_MS)

    // Fade out opening line
    push(() => setShowOpeningLine(false), BACKDROP_SETTLE_MS + OPENING_LINE_VISIBLE_MS)

    // Stage 3: jurors ignite one-by-one
    const jurorsStart = BACKDROP_SETTLE_MS + OPENING_LINE_VISIBLE_MS + OPENING_LINE_FADE_MS
    push(() => setStage('jurors'), jurorsStart)
    for (let i = 0; i < jurors.length; i++) {
      push(() => setVisibleJurorCount(i + 1), jurorsStart + i * JUROR_STAGGER_MS)
    }

    // Stage 4: title card rises
    const allJurorsAt = jurorsStart + jurors.length * JUROR_STAGGER_MS
    const titleCardAt = allJurorsAt + JURORS_HOLD_MS
    push(() => setStage('title_card'), titleCardAt)

    // Stage 5: actions appear
    push(() => setStage('actions'), titleCardAt + TITLE_CARD_SETTLE_MS + ACTIONS_REVEAL_DELAY_MS)

    return clearTimers
  }, [open, jurors.length, noAnimations, prefersReducedMotion, clearTimers, skipToFinal])

  const handleSkip = useCallback(() => {
    skipToFinal(jurors.length)
  }, [skipToFinal, jurors.length])

  if (!open) return null

  const showJurors = stage === 'jurors' || stage === 'title_card' || stage === 'actions'
  const showCard = stage === 'title_card' || stage === 'actions'
  const showActions = stage === 'actions'

  return (
    <div
      className="jpro"
      role="dialog"
      aria-modal="true"
      aria-label="The Jury Takes Control"
    >
      {/* ── Backdrop & atmosphere ─────────────────────────────────────────── */}
      <div className="jpro__backdrop" aria-hidden="true" />
      <div className="jpro__glow" aria-hidden="true" />

      {/* ── Skip affordance (top-right, visible during animation) ─────────── */}
      {!showActions && (
        <button
          className="jpro__skip"
          type="button"
          onClick={handleSkip}
          aria-label="Skip sequence"
        >
          Skip
        </button>
      )}

      {/* ── Stage 2: opening line ─────────────────────────────────────────── */}
      <p
        className={`jpro__opening-line${showOpeningLine ? ' jpro__opening-line--visible' : ''}`}
        aria-hidden={!showOpeningLine}
      >
        The power shifts…
      </p>

      {/* ── Lower content column (jurors → card → actions) ────────────────── */}
      <div className="jpro__content">
        {/* Stage 3: juror ignition row */}
        {showJurors && (
          <div className="jpro__jurors-section">
            <p className="jpro__jurors-label" aria-hidden="true">
              THE JURY
            </p>
            <div className="jpro__jurors-row" role="list" aria-label="The Jury">
              {jurors.map((juror, index) => {
                const isLit = index < visibleJurorCount
                return (
                  <div
                    key={juror.id}
                    className={`jpro__juror${isLit ? ' jpro__juror--lit' : ''}`}
                    role="listitem"
                    aria-label={juror.name}
                  >
                    <JurorAvatar player={juror} />
                    <span className="jpro__juror-name">{juror.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Stage 4: title card */}
        {showCard && (
          <div className="jpro__card">
            <div className="jpro__card-shimmer" aria-hidden="true" />
            <p className="jpro__overline">LIVE FINALE</p>
            <h1 className="jpro__headline">The Jury Takes Control</h1>
            <p className="jpro__subtext">
              Two finalists remain. The jury will decide who wins the season.
            </p>
          </div>
        )}

        {/* Stage 5: actions */}
        {showActions && (
          <div className="jpro__actions">
            <button
              className="jpro__btn-primary"
              type="button"
              onClick={onEnterVote}
            >
              Enter Jury Vote
            </button>
            {onSpyJury && (
              <>
                <button
                  className="jpro__btn-secondary"
                  type="button"
                  onClick={handleSpyJury}
                >
                  Spy Jury
                </button>
                {showSpyHint && (
                  <p className="jpro__spy-hint" role="status" aria-live="polite">
                    Jury House coming soon.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── JurorAvatar helper ────────────────────────────────────────────────────────
/**
 * Renders a juror's circular portrait.
 * Supports emoji avatars, image URLs (with fallback chain), and
 * initials as a last resort — preserving the staggered ignition effect.
 */
function JurorAvatar({ player }: { player: Player }) {
  const [candidateIdx, setCandidateIdx] = useState(0)
  const [showFallback, setShowFallback] = useState(false)

  const candidates = resolveAvatarCandidates(player)
  const src = candidates[candidateIdx] ?? ''
  const fallback = isEmoji(player.avatar ?? '')
    ? (player.avatar ?? '')
    : player.name.charAt(0).toUpperCase()

  if (showFallback || !src) {
    return (
      <div className="jpro__avatar jpro__avatar--fallback" aria-hidden="true">
        {fallback}
      </div>
    )
  }

  if (isEmoji(src)) {
    return (
      <div className="jpro__avatar" aria-hidden="true">
        {src}
      </div>
    )
  }

  return (
    <div className="jpro__avatar" aria-hidden="true">
      <img
        src={src}
        alt=""
        className="jpro__avatar-img"
        onError={() => {
          if (candidateIdx < candidates.length - 1) {
            setCandidateIdx((i) => i + 1)
          } else {
            setShowFallback(true)
          }
        }}
      />
    </div>
  )
}
