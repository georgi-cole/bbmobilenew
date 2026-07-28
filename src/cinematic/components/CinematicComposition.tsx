import { ThreeCanvas } from '@remotion/three'
import { useMemo } from 'react'
import {
  AbsoluteFill,
  Audio,
  Sequence,
  getRemotionEnvironment,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { CinematicCamera } from '../camera/CinematicCamera'
import { City } from '../city/City'
import { CINEMATIC_AUDIO, CINEMATIC_CONFIG, type CreditCard } from '../config/cinematicConfig'
import { getCinematicQuality } from '../config/cinematicQuality'
import { CreditsOverlay } from '../credits/CreditsOverlay'
import { Atmosphere } from '../effects/Atmosphere'
import { FinalCoast } from '../environment/FinalCoast'
import { CinematicLighting } from '../lighting/CinematicLighting'
import { getTimelineState } from '../timeline/timeline'
import LightweightCinematicWorld from './LightweightCinematicWorld'
import { OptionalAssetLayer } from './OptionalAssetLayer'
import './cinematic.css'

const CinematicSoundtrack = () => {
  const { fps, durationInFrames } = useVideoConfig()
  const startFromFrame = Math.round(CINEMATIC_AUDIO.sourceStartInSeconds * fps)
  const fadeInFrames = Math.round(CINEMATIC_AUDIO.fadeInSeconds * fps)
  const fadeOutFrames = Math.round(CINEMATIC_AUDIO.fadeOutSeconds * fps)
  const { isPlayer } = getRemotionEnvironment()
  const source =
    isPlayer && typeof document !== 'undefined'
      ? new URL(CINEMATIC_AUDIO.source, document.baseURI).toString()
      : staticFile(CINEMATIC_AUDIO.source)

  const soundtrackVolume = (localFrame: number) => {
    const fadeIn = Math.min(1, localFrame / fadeInFrames)
    const framesUntilEnd = durationInFrames - 1 - localFrame
    const fadeOut = Math.min(1, Math.max(0, framesUntilEnd / fadeOutFrames))
    return CINEMATIC_AUDIO.volume * Math.min(fadeIn, fadeOut)
  }

  return (
    <Audio src={source} trimBefore={startFromFrame} volume={soundtrackVolume} pauseWhenBuffering />
  )
}

const THUNDER_STRIKES = [
  { frame: 437, volume: 0.23 },
  { frame: 572, volume: 0.18 },
  { frame: 707, volume: 0.24 },
  { frame: 782, volume: 0.15 },
] as const

const CinematicThunder = () => {
  const { fps, durationInFrames } = useVideoConfig()
  const { isPlayer } = getRemotionEnvironment()
  const relativeSource = 'assets/sounds/cinematic-thunder.wav'
  const source =
    isPlayer && typeof document !== 'undefined'
      ? new URL(relativeSource, document.baseURI).toString()
      : staticFile(relativeSource)

  return (
    <>
      {THUNDER_STRIKES.map((strike) => (
        <Sequence
          key={strike.frame}
          from={Math.round((strike.frame / 1799) * (durationInFrames - 1))}
          durationInFrames={Math.round(4.2 * fps)}
        >
          <Audio src={source} volume={strike.volume} />
        </Sequence>
      ))}
    </>
  )
}

const LightningOverlay = ({ frame, opacity }: { frame: number; opacity: number }) => {
  if (opacity <= 0.001) return null
  const draw = Math.min(1, opacity * 2.2)
  const shift = frame < 520 ? -90 : frame < 650 ? 75 : -18
  const strokeStyle = {
    strokeDasharray: 940,
    strokeDashoffset: (1 - draw) * 940,
  }

  return (
    <AbsoluteFill
      style={{
        opacity,
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        transform: `translateX(${shift}px)`,
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1080 1920" width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <filter id="cinematic-lightning-glow" x="-80%" y="-30%" width="260%" height="180%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M650 -35 L604 132 L650 226 L568 377 L611 476 L483 748"
          fill="none"
          stroke="#8bcfff"
          strokeWidth="22"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.16"
          filter="url(#cinematic-lightning-glow)"
          style={strokeStyle}
        />
        <path
          d="M650 -35 L604 132 L650 226 L568 377 L611 476 L483 748"
          fill="none"
          stroke="#f4fcff"
          strokeWidth="4.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={strokeStyle}
        />
        <path
          d="M604 132 L494 236 L435 356"
          fill="none"
          stroke="#c7ecff"
          strokeWidth="2.4"
          strokeLinecap="round"
          style={strokeStyle}
        />
        <path
          d="M568 377 L690 444 L742 552"
          fill="none"
          stroke="#c7ecff"
          strokeWidth="2.2"
          strokeLinecap="round"
          style={strokeStyle}
        />
      </svg>
    </AbsoluteFill>
  )
}

export type CinematicCompositionProps = {
  audioMode?: 'embedded' | 'external'
  credits?: readonly CreditCard[]
}

export const CinematicComposition = ({
  audioMode = 'embedded',
  credits,
}: CinematicCompositionProps) => {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const { isPlayer } = getRemotionEnvironment()
  const state = getTimelineState(frame)
  const quality = useMemo(() => getCinematicQuality(isPlayer), [isPlayer])
  const performanceMode = quality === 'performance'
  const grainFrame = quality === 'high' ? frame : Math.floor(frame / 6) * 6

  return (
    <AbsoluteFill
      className="big-eye-cinematic"
      data-cinematic-quality={quality}
      data-cinematic-renderer={performanceMode ? 'adaptive-dom' : 'webgl'}
    >
      {audioMode === 'embedded' && <CinematicSoundtrack />}
      <CinematicThunder />

      {performanceMode ? (
        <LightweightCinematicWorld frame={frame} state={state} />
      ) : (
        <ThreeCanvas
          width={width}
          height={height}
          dpr={quality === 'high' ? 1 : 0.82}
          camera={{
            fov: CINEMATIC_CONFIG.camera.fov,
            near: CINEMATIC_CONFIG.camera.near,
            far: CINEMATIC_CONFIG.camera.far,
            position: [...CINEMATIC_CONFIG.camera.positionPoints[0]],
          }}
          gl={{
            alpha: false,
            antialias: quality === 'high',
            powerPreference: 'high-performance',
            preserveDrawingBuffer: !isPlayer,
          }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping
            gl.toneMappingExposure = 1.08
            gl.outputColorSpace = SRGBColorSpace
          }}
        >
          <fog attach="fog" args={[state.fogColor, state.fogNear, state.fogFar]} />
          <Atmosphere frame={state.frame} state={state} quality={quality} />
          <CinematicLighting state={state} quality={quality} />
          <City frame={state.frame} state={state} quality={quality} />
          <FinalCoast frame={state.frame} state={state} />
          <CinematicCamera frame={state.frame} progress={state.progress} />
        </ThreeCanvas>
      )}

      {!performanceMode && <LightningOverlay frame={state.frame} opacity={state.lightningBolt} />}
      {!performanceMode && <OptionalAssetLayer state={state} />}
      <div
        className="big-eye-cinematic__grain"
        style={{ backgroundPosition: `${grainFrame % 7}px ${grainFrame % 11}px` }}
        aria-hidden="true"
      />
      <div className="big-eye-cinematic__vignette" aria-hidden="true" />
      <CreditsOverlay frame={frame} state={state} credits={credits} />
      <AbsoluteFill
        style={{
          backgroundColor: '#02030a',
          opacity: state.fadeToDark,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  )
}
