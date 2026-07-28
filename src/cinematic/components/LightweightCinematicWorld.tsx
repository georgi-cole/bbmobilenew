import type { CSSProperties } from 'react'
import { AbsoluteFill } from 'remotion'
import type { TimelineState } from '../timeline/timeline'
import './lightweightCinematicWorld.css'

type LightweightCinematicWorldProps = {
  frame: number
  state: TimelineState
}

type BuildingSpec = {
  left: number
  width: number
  height: number
  depth: number
}

const BUILDINGS: readonly BuildingSpec[] = [
  { left: 0, width: 8, height: 41, depth: 0.72 },
  { left: 7, width: 7, height: 53, depth: 0.84 },
  { left: 13, width: 10, height: 35, depth: 0.66 },
  { left: 22, width: 8, height: 61, depth: 0.94 },
  { left: 29, width: 11, height: 44, depth: 0.76 },
  { left: 39, width: 8, height: 68, depth: 1 },
  { left: 46, width: 10, height: 48, depth: 0.82 },
  { left: 55, width: 7, height: 59, depth: 0.91 },
  { left: 61, width: 11, height: 39, depth: 0.7 },
  { left: 71, width: 8, height: 64, depth: 0.96 },
  { left: 78, width: 10, height: 46, depth: 0.8 },
  { left: 87, width: 7, height: 56, depth: 0.88 },
  { left: 93, width: 8, height: 36, depth: 0.64 },
] as const

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * clamp01(amount)
}

export default function LightweightCinematicWorld({
  frame,
  state,
}: LightweightCinematicWorldProps) {
  const sampledFrame = Math.floor(frame / 3) * 3
  const cityVisibility = clamp01(1 - state.cityExitProgress * 1.12)
  const coastVisibility = clamp01(state.coastProgress)
  const eyeOpen = 0.08 + clamp01(state.eyeOpacity) * 0.92
  const apertureOpening = lerp(54, 2.5, state.apertureClosure)
  const sunLeft = lerp(50, 67, state.sunHorizonProgress)
  const sunTop = lerp(43, 30, state.sunPositionProgress) + state.sunsetProgress * 27
  const cloudShift = sampledFrame * 0.018
  const rainShift = sampledFrame * 1.8

  const worldStyle: CSSProperties = {
    background: `linear-gradient(180deg, ${state.skyTop} 0%, ${state.skyHorizon} 64%, #060913 100%)`,
  }

  return (
    <AbsoluteFill className="light-cinematic" style={worldStyle} aria-hidden="true">
      <div
        className="light-cinematic__stars"
        style={{ opacity: state.starsOpacity * 0.82 }}
      />

      <div
        className="light-cinematic__clouds light-cinematic__clouds--far"
        style={{
          opacity: state.cloudOpacity * 0.62,
          transform: `translate3d(${cloudShift * 0.45}px, 0, 0)`,
          filter: `brightness(${1 - state.cloudDarkness * 0.52})`,
        }}
      />
      <div
        className="light-cinematic__clouds light-cinematic__clouds--near"
        style={{
          opacity: state.cloudOpacity * 0.78,
          transform: `translate3d(${-cloudShift}px, 0, 0)`,
          filter: `brightness(${1 - state.cloudDarkness * 0.62})`,
        }}
      />

      <div
        className="light-cinematic__city"
        style={{
          opacity: cityVisibility,
          transform: `translate3d(0, ${state.cityExitProgress * 44}%, 0)`,
        }}
      >
        <div className="light-cinematic__skyline" style={{ position: 'absolute' }}>
          {BUILDINGS.map((building, index) => (
            <div
              key={`${building.left}-${building.height}`}
              className="light-cinematic__building"
              style={{
                left: `${building.left}%`,
                width: `${building.width}%`,
                height: `${building.height}%`,
                opacity: building.depth,
                filter: `brightness(${0.72 + state.ambientIntensity * 0.16})`,
              }}
            >
              <span
                style={{
                  opacity: clamp01(state.windowIntensity * 0.28),
                  backgroundPosition: `${(index % 3) * 5}px ${(index % 4) * 7}px`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="light-cinematic__road" style={{ position: 'absolute' }}>
          <span
            style={{
              opacity: clamp01(state.vehicleLightIntensity * 0.52),
              transform: `translate3d(0, ${(sampledFrame * 0.42) % 34}px, 0)`,
            }}
          />
        </div>
        <div
          className="light-cinematic__wet-glow"
          style={{ position: 'absolute', opacity: state.wetness * 0.56 }}
        />
      </div>

      <div
        className="light-cinematic__coast"
        style={{
          opacity: coastVisibility,
          clipPath: `polygon(0 ${100 - coastVisibility * 100}%, 100% ${100 - coastVisibility * 100}%, 100% 100%, 0 100%)`,
        }}
      >
        <div
          className="light-cinematic__sun"
          style={{
            position: 'absolute',
            left: `${sunLeft}%`,
            top: `${sunTop}%`,
            opacity: clamp01(state.sunRevealProgress * state.sunIntensity * 1.18),
            transform: `translate(-50%, -50%) scale(${lerp(0.72, 1.34, state.sunHorizonProgress)})`,
            filter: `hue-rotate(${state.sunsetProgress * -18}deg)`,
          }}
        />
        <div
          className="light-cinematic__ocean"
          style={{
            position: 'absolute',
            backgroundPosition: `0 ${sampledFrame * 0.12}px`,
            filter: `brightness(${1 - state.sunsetProgress * 0.45}) saturate(${1 + state.goldenHourProgress * 0.28})`,
          }}
        />
        <div
          className="light-cinematic__shore"
          style={{
            position: 'absolute',
            filter: `brightness(${1 - state.sunsetProgress * 0.38})`,
          }}
        />
      </div>

      <div
        className="light-cinematic__eye"
        style={{
          opacity: state.eyeOpacity,
          transform: `translate(-50%, -50%) scaleY(${eyeOpen})`,
        }}
      >
        <span />
      </div>

      <div
        className="light-cinematic__rain"
        style={{
          opacity: state.rainIntensity * 0.68,
          backgroundPosition: `${rainShift * 0.2}px ${rainShift}px`,
        }}
      />

      <div
        className="light-cinematic__lightning"
        style={{ opacity: clamp01(state.lightning * 0.82) }}
      />

      {state.apertureClosure > 0.001 && (
        <div
          className="light-cinematic__aperture"
          style={{
            opacity: clamp01(state.apertureClosure * 1.35),
            background: `radial-gradient(circle at 50% 47%, transparent 0 ${apertureOpening}%, rgba(2, 3, 8, 0.985) ${apertureOpening + 2.8}% 100%)`,
          }}
        />
      )}
    </AbsoluteFill>
  )
}
