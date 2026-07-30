import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from 'framer-motion'
import TvAnnouncementOverlay, {
  type Announcement,
} from '../TvAnnouncementOverlay/TvAnnouncementOverlay'
import type { CupidArrowPair } from '../../../types'
import { SoundManager } from '../../../services/sound/SoundManager'
import './ShockIntroOverlay.css'

const SHOCK_INTRO_FULLSCREEN_HOLD_MS = 2000
const SHOCK_INTRO_HANDOFF_DURATION_MS = 320
const SHOCK_INTRO_DURATION_MS = SHOCK_INTRO_FULLSCREEN_HOLD_MS + SHOCK_INTRO_HANDOFF_DURATION_MS
const CUPID_INTRO_DURATION_MS = 6400
const CUPID_BREAK_DURATION_MS = 7800
const SHOCK_INTRO_REDUCED_DURATION_MS = 400

const SHOCK_ANNOUNCEMENTS: Record<string, Announcement> = {
  twist: {
    key: 'twist',
    title: 'Shock Alert!',
    subtitle: 'The Big Eye has a surprise.',
    isLive: true,
    autoDismissMs: null,
  },
  double_eviction: {
    key: 'double_eviction',
    title: 'Double Elimination!',
    subtitle: 'Tonight the LOH nominates three. Two will be eliminated.',
    isLive: true,
    autoDismissMs: null,
  },
  vip_veto: {
    key: 'vip_veto',
    title: 'Double Trouble!',
    subtitle: 'The holder may use the power twice this ceremony. 👑',
    isLive: true,
    autoDismissMs: null,
  },
  diamond_pov: {
    key: 'diamond_pov',
    title: 'Halo Exchange!',
    subtitle: 'The holder may name the backup nominee. 😇',
    isLive: true,
    autoDismissMs: null,
  },
  coup_detat: {
    key: 'coup_detat',
    title: 'Detox!',
    subtitle: 'Both nominees cleared. Holder names two backup nominees. ⚡',
    isLive: true,
    autoDismissMs: null,
  },
  spotlight_veto: {
    key: 'spotlight_veto',
    title: 'Force Majeure!',
    subtitle: 'The holder is forced to use the power this ceremony. ✨',
    isLive: true,
    autoDismissMs: null,
  },
  battle_back: {
    key: 'battle_back',
    title: 'Back 2 the Game',
    subtitle: 'Eliminated players compete for a second chance.',
    isLive: true,
    autoDismissMs: null,
  },
  battle_back_shock: {
    key: 'battle_back_shock',
    title: 'Shock Twist',
    subtitle: 'Back 2 the Game has been activated. A return is now on the table.',
    isLive: true,
    autoDismissMs: null,
  },
  battle_back_rules: {
    key: 'battle_back_rules',
    title: 'Back 2 the Game Rules',
    subtitle: 'Tribunal members face off. Only one can return.',
    isLive: true,
    autoDismissMs: null,
  },
  battle_back_challenge: {
    key: 'battle_back_challenge',
    title: 'Back 2 the Game Challenge',
    subtitle: 'Press play to begin the showdown.',
    isLive: true,
    autoDismissMs: null,
  },
}

const FALLBACK_STINGER = SHOCK_ANNOUNCEMENTS.twist

export interface ShockIntroOverlayProps {
  active: boolean
  shockKey: string
  announcement?: Announcement | null
  cupidPairs?: CupidArrowPair[]
  onComplete: () => void
}

function CupidHeartArtwork({
  broken = false,
  className,
  colors = [],
}: {
  broken?: boolean
  className: string
  colors?: string[]
}) {
  const heartColors = colors.length > 0 ? colors : ['#ffc4d8', '#ec79a7', '#9f3e79']
  return (
    <svg className={className} viewBox="0 0 180 164" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id="cupid-heart-fill" x1="0.12" y1="0.05" x2="0.86" y2="0.94">
          {heartColors.map((color, index) => (
            <stop
              key={`${color}-${index}`}
              offset={`${(index / Math.max(heartColors.length - 1, 1)) * 100}%`}
              stopColor={color}
            />
          ))}
        </linearGradient>
        <radialGradient id="cupid-heart-shine" cx="0.32" cy="0.18" r="0.72">
          <stop offset="0" stopColor="#fff8fb" stopOpacity=".85" />
          <stop offset=".34" stopColor="#ffd4e3" stopOpacity=".12" />
          <stop offset="1" stopColor="#ffd4e3" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className={broken ? 'cupid-heart-art cupid-heart-art--broken' : 'cupid-heart-art'}>
        <path
          className="cupid-heart-art__body"
          fill="url(#cupid-heart-fill)"
          d="M90 148C65 127 21 99 21 57c0-25 17-42 40-42 14 0 24 6 29 18 6-12 16-18 30-18 23 0 40 17 40 42 0 42-44 70-70 91Z"
        />
        <path
          className="cupid-heart-art__shine"
          fill="url(#cupid-heart-shine)"
          d="M90 148C65 127 21 99 21 57c0-25 17-42 40-42 14 0 24 6 29 18 6-12 16-18 30-18 23 0 40 17 40 42 0 42-44 70-70 91Z"
        />
        {broken && (
          <>
            <path className="cupid-heart-art__rift" d="m93 24-17 31 17 14-18 19 15 14-10 36" />
            <path
              className="cupid-heart-art__spark"
              d="m63 58-13-8M120 70l15-9M61 103l-14 8M120 108l16 11"
            />
          </>
        )}
      </g>
    </svg>
  )
}

function CupidArrowArtwork({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 360 112" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id="cupid-arrow-metal" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#e39bb8" />
          <stop offset=".45" stopColor="#ffe8ba" />
          <stop offset="1" stopColor="#fff5d8" />
        </linearGradient>
      </defs>
      <g className="cupid-arrow-art">
        <path className="cupid-arrow-art__shaft" d="M45 58h260" stroke="url(#cupid-arrow-metal)" />
        <path className="cupid-arrow-art__head" d="m306 58-33-25 7 19-7 6 7 6-7 19 33-25Z" />
        <path
          className="cupid-arrow-art__feather"
          d="M47 58 18 35l20 4 9-17 13 30M47 58 18 81l20-4 9 17 13-30"
        />
        <path
          className="cupid-arrow-art__heart"
          d="M178 73c-11-8-25-17-25-31 0-8 5-13 12-13 6 0 10 3 13 8 3-5 7-8 13-8 7 0 12 5 12 13 0 14-14 23-25 31Z"
        />
      </g>
    </svg>
  )
}

function CupidFlightArtwork({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 190 150" focusable="false" aria-hidden="true">
      <g className="cupid-flight-art">
        <path
          className="cupid-flight-art__wing"
          d="M74 72C45 46 21 49 10 71c24-7 37 4 43 16-19-1-28 8-31 22 24-12 43-8 57 5"
        />
        <path
          className="cupid-flight-art__wing"
          d="M111 69c29-25 53-21 64 2-24-8-37 3-44 15 19 0 28 9 31 23-23-13-43-9-57 4"
        />
        <circle className="cupid-flight-art__body" cx="94" cy="46" r="17" />
        <path className="cupid-flight-art__body" d="M77 68c8-10 27-10 35 0l7 43H70l7-43Z" />
        <path
          className="cupid-flight-art__line"
          d="M119 57c21 8 32 27 28 48M147 105c-11-5-21-5-31 0M145 65c-8 7-12 17-12 30"
        />
        <path className="cupid-flight-art__arrow" d="m125 99 34-20M159 79l-9 1 5 7" />
        <path className="cupid-flight-art__halo" d="M75 23c13-7 27-7 40 0" />
      </g>
    </svg>
  )
}

function CupidSigilArtwork({ broken }: { broken: boolean }) {
  return broken ? (
    <svg viewBox="0 0 52 52" aria-hidden="true">
      <path
        className="cupid-sigil-art__heart"
        d="M25 44C17 37 6 30 6 18c0-7 5-12 11-12 4 0 7 2 9 5 2-3 5-5 9-5 6 0 11 5 11 12 0 12-12 20-20 26"
      />
      <path className="cupid-sigil-art__rift" d="m28 8-7 12 7 5-8 8 6 5-2 7" />
    </svg>
  ) : (
    <svg viewBox="0 0 52 52" aria-hidden="true">
      <path
        className="cupid-sigil-art__bow"
        d="M13 7c17 8 22 29 4 39M39 7c-17 8-22 29-4 39M15 8l21 37"
      />
      <path className="cupid-sigil-art__arrow" d="M8 40 42 13M42 13l-9 1 6 7" />
      <path
        className="cupid-sigil-art__heart"
        d="M26 33c-5-4-11-8-11-14 0-4 3-7 6-7 3 0 4 1 5 4 1-3 3-4 5-4 4 0 6 3 6 7 0 6-6 10-11 14Z"
      />
    </svg>
  )
}

export default function ShockIntroOverlay({
  active,
  shockKey,
  announcement = null,
  cupidPairs = [],
  onComplete,
}: ShockIntroOverlayProps) {
  const prefersReducedMotion = useReducedMotion()
  const isCupidIntro = shockKey === 'cupid_arrow'
  const isCupidBreak = shockKey === 'cupid_arrow_broken'
  const isCupid = isCupidIntro || isCupidBreak
  const duration = prefersReducedMotion
    ? SHOCK_INTRO_REDUCED_DURATION_MS
    : isCupidBreak
      ? CUPID_BREAK_DURATION_MS
      : isCupidIntro
        ? CUPID_INTRO_DURATION_MS
        : SHOCK_INTRO_DURATION_MS

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(onComplete, duration)
    return () => window.clearTimeout(timer)
  }, [active, duration, shockKey, onComplete])

  useEffect(() => {
    if (!active) return

    const cueTimers: number[] = []
    if (isCupidIntro) {
      // Keep Cupid distinct from the season-winner reveal: a soft arrival cue,
      // then a separate sparkle when the pairs lock in.
      void SoundManager.play('ui:navigate', { volume: 0.34 })
      cueTimers.push(
        window.setTimeout(() => void SoundManager.play('ui:confirm', { volume: 0.34 }), 1450)
      )
    } else if (isCupidBreak) {
      void SoundManager.play('player:evicted', { volume: 0.48 })
      cueTimers.push(
        window.setTimeout(() => void SoundManager.play('ui:confirm', { volume: 0.25 }), 2500),
        window.setTimeout(() => void SoundManager.play('ui:error', { volume: 0.38 }), 4400),
        window.setTimeout(() => void SoundManager.play('ui:navigate', { volume: 0.3 }), 5850)
      )
    }

    return () => cueTimers.forEach((timerId) => window.clearTimeout(timerId))
  }, [active, isCupidBreak, isCupidIntro])

  if (!active || typeof document === 'undefined') return null

  const displayAnnouncement = announcement ??
    SHOCK_ANNOUNCEMENTS[shockKey] ?? {
      ...FALLBACK_STINGER,
      key: shockKey || FALLBACK_STINGER.key,
    }
  const cupidColorMix = cupidPairs.length
    ? `conic-gradient(from 210deg, ${cupidPairs
        .map((pair, index) => `${pair.color} ${(index / cupidPairs.length) * 100}%`)
        .join(', ')}, ${cupidPairs[0].color} 100%)`
    : 'conic-gradient(from 210deg, #ff98ba, #e3b5ef, #8bb9eb, #ffd28a, #ff98ba)'

  return createPortal(
    <div
      className={['shock-intro', prefersReducedMotion ? 'shock-intro--reduced' : '']
        .filter(Boolean)
        .join(' ')}
      data-cupid-mode={isCupidBreak ? 'breaking' : isCupidIntro ? 'arriving' : undefined}
      aria-hidden="true"
      data-testid="shock-intro-overlay"
      style={{ '--shock-intro-duration-ms': `${duration}ms` } as CSSProperties}
    >
      {isCupid && (
        <div className="shock-intro__cupid-cinematic">
          {isCupidBreak && (
            <span
              className="shock-intro__cupid-color-bloom"
              style={{ background: cupidColorMix }}
              aria-hidden="true"
            />
          )}
          <div className="shock-intro__cupid-departure">
            <CupidHeartArtwork
              className="shock-intro__cupid-heart"
              broken={isCupidBreak}
              colors={isCupidBreak ? cupidPairs.map((pair) => pair.color) : undefined}
            />
            <CupidFlightArtwork className="shock-intro__cupid-flight" />
          </div>
          <CupidArrowArtwork className="shock-intro__cupid-arrow" />
          {isCupidBreak &&
            cupidPairs.map((pair, index) => {
              const angle = (index / Math.max(cupidPairs.length, 1)) * Math.PI * 2 - Math.PI / 2
              const mixAngle = angle * 1.7 + 0.38
              return (
                <span
                  key={pair.id}
                  className="shock-intro__pair-token"
                  style={
                    {
                      '--cupid-pair-color': pair.color,
                      '--cupid-pair-start-x': `${Math.cos(angle) * 38}vw`,
                      '--cupid-pair-start-y': `${Math.sin(angle) * 31}vh`,
                      '--cupid-pair-mix-x': `${Math.cos(mixAngle) * 3.6}vw`,
                      '--cupid-pair-mix-y': `${Math.sin(mixAngle) * 3.1}vh`,
                    } as CSSProperties
                  }
                >
                  {pair.id.replace('cupid-pair-', '')}
                </span>
              )
            })}
          <span className="shock-intro__cupid-petal shock-intro__cupid-petal--1" />
          <span className="shock-intro__cupid-petal shock-intro__cupid-petal--2" />
          <span className="shock-intro__cupid-petal shock-intro__cupid-petal--3" />
          <span className="shock-intro__cupid-petal shock-intro__cupid-petal--4" />
          <span className="shock-intro__cupid-petal shock-intro__cupid-petal--5" />
          <span className="shock-intro__cupid-petal shock-intro__cupid-petal--6" />
        </div>
      )}

      {isCupid ? (
        <div className="shock-intro__cupid-proclamation">
          <p className="shock-intro__cupid-kicker">
            {isCupidBreak ? 'THE LAST BOND FALLS' : 'A FULL-SEASON SHOCK'}
          </p>
          <div className="shock-intro__cupid-sigil" aria-hidden="true">
            <CupidSigilArtwork broken={isCupidBreak} />
          </div>
          <h1>
            {isCupidBreak ? (
              <>
                THE SPELL
                <strong>IS BROKEN</strong>
              </>
            ) : (
              <>
                CUPID&apos;S
                <strong>ARROW</strong>
              </>
            )}
          </h1>
          <div className="shock-intro__cupid-divider" aria-hidden="true">
            <span />
            <b className={isCupidBreak ? 'shock-intro__divider-mark--broken' : ''} />
            <span />
          </div>
          <p className="shock-intro__cupid-declaration">
            {isCupidBreak
              ? 'Cupid abandons the house. Every surviving housemate now stands alone.'
              : 'Sixteen housemates. Eight bonds. From this moment, every victory and every fall is shared.'}
          </p>
          <p className="shock-intro__cupid-handoff">
            {isCupidBreak ? 'The individual game returns' : 'The Big Eye will reveal the rules'}
          </p>
        </div>
      ) : (
        <div className="shock-intro__vision-stage">
          <TvAnnouncementOverlay announcement={displayAnnouncement} paused showInfoButton={false} />
        </div>
      )}
    </div>,
    document.body
  )
}
