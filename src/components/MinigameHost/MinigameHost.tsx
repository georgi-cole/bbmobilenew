// MODULE: src/components/MinigameHost/MinigameHost.tsx
// Full-screen host for minigames (legacy and React-implemented).
//
// Flow:
//   1. Rules modal  (unless skipRules is true)
//   2. 3-second "Get Ready" countdown
//   3. Minigame — either a React component or a legacy bundle
//   4. Results screen → calls onDone(rawValue)
//
// The host also owns one seamless edge utility dock for revisiting rules and
// leaving a competition. Individual minigames must not render their own exit UI.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { isPlacementRankingGame, type GameRegistryEntry } from '../../minigames/registry'
import MinigameRules from '../MinigameRules/MinigameRules'
import MinigameUtilityDock from '../MinigameUtilityDock/MinigameUtilityDock'
import LegacyMinigameWrapper from '../../minigames/LegacyMinigameWrapper'
import type { LegacyRawResult } from '../../minigames/LegacyMinigameWrapper'
import { SoundManager } from '../../services/sound/SoundManager'
import {
  MINIGAME_MUSIC_VARIANT_EVENT,
  type MinigameMusicVariantDetail,
} from '../../services/sound/minigameMusicVariant'
import type { MusicMinigameVariant } from '../../services/sound/musicConfig'
import ClosestWithoutGoingOverComp from '../ClosestWithoutGoingOverComp'
import type { CwgoPrizeType } from '../../features/cwgo/cwgoCompetitionSlice'
import HoldTheWallComp from '../HoldTheWallComp/HoldTheWallComp'
import type { HoldTheWallPrizeType } from '../../features/holdTheWall/holdTheWallSlice'
import BiographyBlitzComp from '../BiographyBlitzComp/biography_blitz_game'
import type { BiographyBlitzCompetitionType } from '../../features/biographyBlitz/biography_blitz_logic'
import FamousFiguresComp from '../FamousFiguresComp/FamousFiguresComp'
import type { FamousFiguresPrizeType } from '../../features/famousFigures/famousFiguresSlice'
import SilentSaboteurComp from '../SilentSaboteurComp/SilentSaboteurComp'
import type { SilentSaboteurPrizeType } from '../../features/silentSaboteur/silentSaboteurSlice'
import MajorityRulesComp from '../MajorityRulesComp/MajorityRulesComp'
import type { MajorityRulesCompetitionType } from '../../features/majorityRules/majorityRulesSlice'
import { buildGlassBridgeTimeLimitMs } from '../../features/glassBridge/glassBridgeSlice'
import GlassBridgeComp from '../GlassBridgeComp/GlassBridgeComp'
import CrystalPathShatteredGame from '../../minigames/crystalPathShattered/CrystalPathShatteredGame'
import BlackjackTournamentComp from '../BlackjackTournamentComp/BlackjackTournamentComp'
import type { BlackjackTournamentCompetitionType } from '../../features/blackjackTournament/blackjackTournamentSlice'
import RiskWheelComp from '../RiskWheelComp/RiskWheelComp'
import type { RiskWheelCompetitionType } from '../../features/riskWheel/riskWheelSlice'
import WildcardWesternComp from '../WildcardWesternComp/WildcardWesternComp'
import CodeBreakerComp from '../CodeBreakerComp/CodeBreakerComp'
import type { CodeBreakerPrizeType } from '../CodeBreakerComp/CodeBreakerComp'
import TetrisComp from '../TetrisComp/TetrisComp'
import type { TetrisPrizeType } from '../../features/tetris/tetrisSlice'
import TiltLabyrinthComp from '../TiltLabyrinthComp/TiltLabyrinthComp'
import type { TiltLabyrinthPrizeType } from '../../features/tiltLabyrinth/tiltLabyrinthSlice'
import HouseOfCardsComp from '../HouseOfCardsComp/HouseOfCardsComp'
import type { HouseOfCardsPrizeType } from '../../features/houseOfCards/houseOfCardsSlice'
import MemoryColorsComp from '../MemoryColorsComp/MemoryColorsComp'
import type { MemoryColorsCompetitionType } from '../../features/memoryColors/memoryColorsSlice'
import TrapAuctionComp from '../TrapAuction/TrapAuction'
import ColorMatchComp from '../ColorMatchComp/ColorMatchComp'
import reactComponents from '../../minigames/reactComponents'
import './MinigameHost.css'

const COUNTDOWN_TIMER_KEY = 'minigame:all_3_seconds_timer'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MinigameParticipant {
  id: string
  name: string
  isHuman: boolean
  avatar?: string
  /** Pre-computed raw score for AI players; ignored for the human (finalValue is used). */
  precomputedScore: number
  /** Previous personal-record value for this game, using the game's native metric. */
  previousPR: number | null
}

export interface ReactMinigameCompletion {
  authoritativeWinnerId?: string | null
  /** Authoritative worst finisher when the minigame owns its full standings. */
  authoritativeLastPlaceId?: string | null
  rawValue?: number
  rawResults?: Record<string, number>
  /** Optional time-based tie-breaker in ms (lower = faster = better rank). */
  tiebreakerMs?: number
}

interface Props {
  game: GameRegistryEntry
  /** Options forwarded to the legacy module (e.g. seed, timeLimit). */
  gameOptions?: Record<string, unknown>
  /** Called when the minigame ends (normally or via quit). */
  onDone: (rawValue: number, partial?: boolean, completion?: ReactMinigameCompletion) => void
  /** Publishes the host's actual visual lifecycle to the central music resolver. */
  onPhaseChange?: (phase: HostPhase) => void
  onMusicVariantChange?: (variant: MusicMinigameVariant) => void
  /** When true the rules modal is skipped and countdown starts immediately. */
  skipRules?: boolean
  /** When true the 3-second countdown is skipped (for testing). */
  skipCountdown?: boolean
  /** Competition participants shown in hosted leaderboards. */
  participants?: MinigameParticipant[]
  competitionRetry?: {
    enabled: boolean
    pending?: boolean
    onWatch: (onReward: () => void) => void
    onContinueWithoutRetry?: () => void
  }
}

export type HostPhase = 'rules' | 'countdown' | 'playing' | 'results'
type UtilityView = 'menu' | 'rules' | 'exit' | null

const MEDALS = ['🥇', '🥈', '🥉']

function fmtScore(value: number): string {
  return String(Math.round(value))
}

function fmtOrdinal(value: number): string {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`
  const mod10 = value % 10
  if (mod10 === 1) return `${value}st`
  if (mod10 === 2) return `${value}nd`
  if (mod10 === 3) return `${value}rd`
  return `${value}th`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MinigameHost({
  game,
  gameOptions = {},
  onDone,
  onPhaseChange,
  onMusicVariantChange,
  skipRules = false,
  skipCountdown = false,
  participants,
  competitionRetry,
}: Props) {
  const [phase, setPhase] = useState<HostPhase>(skipRules ? 'countdown' : 'rules')
  const [utilityView, setUtilityView] = useState<UtilityView>(null)
  const [countdown, setCountdown] = useState(3)
  const [finalValue, setFinalValue] = useState<number | null>(null)
  const [finalTiebreakerMs, setFinalTiebreakerMs] = useState<number | null>(null)
  const [wasPartial, setWasPartial] = useState(false)
  const completionReportedRef = useRef(false)

  const reportDoneOnce = useCallback(
    (
      rawValue: number,
      partial = false,
      completion?: ReactMinigameCompletion,
      includeCompletion = completion != null
    ) => {
      if (completionReportedRef.current) return
      completionReportedRef.current = true
      if (includeCompletion) {
        onDone(rawValue, partial, completion)
      } else {
        onDone(rawValue, partial)
      }
    },
    [onDone]
  )

  const rankingOnly = isPlacementRankingGame(game)
  const competitionRetryEnabled = competitionRetry?.enabled ?? false
  const rulesGame = useMemo(
    () =>
      game.key === 'glass_bridge_brutal'
        ? {
            ...game,
            timeLimitMs: buildGlassBridgeTimeLimitMs((participants ?? []).length),
          }
        : game,
    [game, participants]
  )

  useEffect(() => {
    completionReportedRef.current = false
    setUtilityView(null)
  }, [game.key])

  useEffect(() => {
    onPhaseChange?.(phase)
    if (phase !== 'playing') onMusicVariantChange?.('normal')
  }, [onMusicVariantChange, onPhaseChange, phase])

  useEffect(() => {
    if (phase !== 'playing') return
    const handleVariant = (event: Event) => {
      const detail = (event as CustomEvent<MinigameMusicVariantDetail>).detail
      if (!detail || (detail.gameKey && detail.gameKey !== game.key)) return
      onMusicVariantChange?.(detail.variant)
    }
    window.addEventListener(MINIGAME_MUSIC_VARIANT_EVENT, handleVariant)
    return () => window.removeEventListener(MINIGAME_MUSIC_VARIANT_EVENT, handleVariant)
  }, [game.key, onMusicVariantChange, phase])

  useEffect(() => {
    if (phase === 'results') setUtilityView(null)
  }, [phase])

  useEffect(() => {
    if (utilityView == null) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUtilityView(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [utilityView])

  useEffect(() => {
    if (phase === 'countdown' && utilityView !== null) {
      setCountdown(3)
    }
  }, [phase, utilityView])

  const handleRulesConfirm = useCallback(() => {
    setUtilityView(null)
    setCountdown(3)
    setPhase('countdown')
  }, [])

  const handleConfirmEarlyExit = useCallback(() => {
    setUtilityView(null)
    // Product rule: abandoning a minigame records 0 and lets the existing
    // competition simulation/ranking continue so LOH/POS can still resolve.
    setFinalValue(0)
    setWasPartial(true)
    setPhase('results')
  }, [])

  // Pause the host-owned countdown while the menu, rules, or warning is open.
  useEffect(() => {
    if (phase !== 'countdown' || utilityView !== null) return
    if (skipCountdown) {
      const t = setTimeout(() => setPhase('playing'), 0)
      return () => clearTimeout(t)
    }
    if (countdown <= 0) {
      const t = setTimeout(() => setPhase('playing'), 600)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, countdown, skipCountdown, utilityView])

  // Keep the countdown SFX synchronized with the reset/paused visual countdown.
  useEffect(() => {
    if (phase !== 'countdown' || skipCountdown || utilityView !== null) {
      SoundManager.stop(COUNTDOWN_TIMER_KEY)
      return
    }
    void SoundManager.play(COUNTDOWN_TIMER_KEY)
    return () => SoundManager.stop(COUNTDOWN_TIMER_KEY)
  }, [phase, skipCountdown, utilityView])

  const handleComplete = useCallback((result: LegacyRawResult) => {
    setFinalValue(result.value)
    setWasPartial(false)
    setPhase('results')
  }, [])

  const handleQuit = useCallback((partial: LegacyRawResult) => {
    setFinalValue(partial.value)
    setWasPartial(true)
    setPhase('results')
  }, [])

  const handleReactComplete = useCallback(
    (completion?: ReactMinigameCompletion) => {
      reportDoneOnce(completion?.rawValue ?? 1, false, completion, true)
    },
    [reportDoneOnce]
  )

  const handleContinue = useCallback(() => {
    const completion: ReactMinigameCompletion | undefined =
      finalTiebreakerMs != null
        ? {
            tiebreakerMs: finalTiebreakerMs,
          }
        : undefined
    if (completion != null) {
      reportDoneOnce(finalValue ?? 0, wasPartial, completion)
    } else {
      reportDoneOnce(finalValue ?? 0, wasPartial)
    }
  }, [finalTiebreakerMs, finalValue, reportDoneOnce, wasPartial])

  const leaderboard = useMemo(() => {
    if (!participants || participants.length === 0) return null
    const humanScore = finalValue ?? 0
    const lowerBetter = game.scoringAdapter === 'lowerBetter'
    const entries = participants.map((p) => {
      const score = p.isHuman ? humanScore : p.precomputedScore
      const isPR =
        p.previousPR === null || (lowerBetter ? score < p.previousPR : score > p.previousPR)
      return { ...p, score, isPR }
    })
    entries.sort((a, b) => {
      if (competitionRetryEnabled && wasPartial) {
        if (a.isHuman !== b.isHuman) return a.isHuman ? 1 : -1
      }
      return lowerBetter ? a.score - b.score : b.score - a.score
    })
    return entries
  }, [competitionRetryEnabled, participants, finalValue, game.scoringAdapter, wasPartial])

  const humanLastPlaceEntry = leaderboard?.[leaderboard.length - 1] ?? null
  const showCompetitionRetry = competitionRetryEnabled && !!humanLastPlaceEntry?.isHuman
  const activeCompetitionRetry = showCompetitionRetry && competitionRetry ? competitionRetry : null
  const showOrganicLastPlace = showCompetitionRetry && !wasPartial
  const showTimeMachineResults = wasPartial || showOrganicLastPlace

  const handleRetryRestart = useCallback(() => {
    setUtilityView(null)
    setFinalValue(null)
    setFinalTiebreakerMs(null)
    setWasPartial(false)
    setCountdown(3)
    setPhase(skipCountdown ? 'playing' : 'countdown')
  }, [skipCountdown])

  const renderActiveGame = () => {
    const participantIds = (participants ?? []).map((p) => p.id)
    const seed = typeof gameOptions?.seed === 'number' ? gameOptions.seed : 0

    if (game.implementation === 'react' && game.reactComponentKey === 'ClosestWithoutGoingOver') {
      return (
        <ClosestWithoutGoingOverComp
          participantIds={participantIds}
          prizeType={gameOptions?.prizeType as CwgoPrizeType}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'HoldTheWall') {
      return (
        <HoldTheWallComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as HoldTheWallPrizeType}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'BiographyBlitz') {
      return (
        <BiographyBlitzComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as BiographyBlitzCompetitionType}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'FamousFigures') {
      return (
        <FamousFiguresComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as FamousFiguresPrizeType}
          seed={import.meta.env.PROD ? 0 : seed}
          onComplete={handleReactComplete}
          skipWinnerAnimation={true}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'SilentSaboteur') {
      return (
        <SilentSaboteurComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as SilentSaboteurPrizeType}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'MajorityRules') {
      if (import.meta.env.DEV) {
        console.log('MAJORITY_RULES_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <MajorityRulesComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as MajorityRulesCompetitionType) ?? 'LOH'}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'GlassBridge') {
      if (import.meta.env.DEV) {
        console.log('GLASS_BRIDGE_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <GlassBridgeComp
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as 'LOH' | 'POS' | undefined}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'CrystalPathShattered') {
      if (import.meta.env.DEV) {
        console.log('CRYSTAL_PATH_SHATTERED_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <CrystalPathShatteredGame
          participantIds={participantIds}
          participants={participants}
          prizeType={gameOptions?.prizeType as 'LOH' | 'POS' | undefined}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'BlackjackTournament') {
      return (
        <BlackjackTournamentComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as BlackjackTournamentCompetitionType) ?? 'LOH'}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'RiskWheel') {
      if (import.meta.env.DEV) {
        console.log('RISK_WHEEL_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <RiskWheelComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as RiskWheelCompetitionType) ?? 'LOH'}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'WildcardWestern') {
      return (
        <WildcardWesternComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as 'LOH' | 'POS') ?? 'LOH'}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'CodeBreaker') {
      return (
        <CodeBreakerComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as CodeBreakerPrizeType) ?? 'LOH'}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'Tetris') {
      return (
        <TetrisComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as TetrisPrizeType) ?? 'LOH'}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'HouseOfCards') {
      if (import.meta.env.DEV) {
        console.log('HOUSE_OF_CARDS_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <HouseOfCardsComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as HouseOfCardsPrizeType) ?? 'LOH'}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'TiltLabyrinth') {
      return (
        <TiltLabyrinthComp
          key={`tilt-labyrinth:${seed}:${(gameOptions?.prizeType as string) ?? 'LOH'}:${participantIds.join(',')}`}
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as TiltLabyrinthPrizeType) ?? 'LOH'}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'MemoryColors') {
      return (
        <MemoryColorsComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as MemoryColorsCompetitionType) ?? 'LOH'}
          seed={seed}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'TrapAuction') {
      return (
        <TrapAuctionComp
          participantIds={participantIds}
          participants={participants}
          prizeType={(gameOptions?.prizeType as 'LOH' | 'POS') ?? 'LOH'}
          seed={seed}
          autoStart={true}
          onComplete={handleReactComplete}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'ColorMatch') {
      if (import.meta.env.DEV) {
        console.log('COLOR_MATCH_NEW_SESSION', {
          source: 'MinigameHost',
          challengeSeedIgnored: seed,
          participantIds,
          prizeType: gameOptions?.prizeType ?? 'LOH',
        })
      }
      return (
        <ColorMatchComp
          autoStart={true}
          participantIds={participantIds}
          participants={participants}
          onFinish={(
            value: number,
            tiebreakerMs?: number,
            completion?: ReactMinigameCompletion
          ) => {
            if (completion?.authoritativeWinnerId) {
              reportDoneOnce(value, false, completion, true)
              return
            }
            setFinalValue(value)
            setFinalTiebreakerMs(tiebreakerMs ?? null)
            setWasPartial(false)
            setPhase('results')
          }}
        />
      )
    }

    if (game.implementation === 'react' && game.reactComponentKey === 'Capitalization') {
      const CapitalizationComp = reactComponents.Capitalization
      return (
        <CapitalizationComp
          autoStart={true}
          participantIds={participantIds}
          participants={participants}
          onFinish={(
            value: number,
            tiebreakerMs?: number,
            completion?: ReactMinigameCompletion
          ) => {
            if (game.scoringAdapter === 'authoritative' || completion?.authoritativeWinnerId) {
              reportDoneOnce(value, false, completion, true)
              return
            }
            setFinalValue(value)
            setFinalTiebreakerMs(tiebreakerMs ?? null)
            setWasPartial(false)
            setPhase('results')
          }}
        />
      )
    }

    if (game.implementation === 'react') {
      const key = game.reactComponentKey
      if (!key) {
        throw new Error(
          `[MinigameHost] game '${game.key}' has implementation 'react' but no reactComponentKey defined. ` +
            `React-implemented games must define reactComponentKey.`
        )
      }
      const GenericComp = reactComponents[key]
      if (!GenericComp) {
        throw new Error(
          `[MinigameHost] reactComponentKey '${key}' not found in reactComponents map. ` +
            `Add it to src/minigames/reactComponents.ts. ` +
            `React-implemented games (implementation === 'react') should not use LegacyMinigameWrapper.`
        )
      }
      return (
        <GenericComp
          seed={seed}
          autoStart={key !== 'HangmanChallenge'}
          participantIds={participantIds}
          participants={participants}
          onFinish={(
            value: number,
            tiebreakerMs?: number,
            completion?: ReactMinigameCompletion
          ) => {
            if (game.scoringAdapter === 'authoritative' || completion?.authoritativeWinnerId) {
              reportDoneOnce(value, false, completion, true)
              return
            }
            setFinalValue(value)
            setFinalTiebreakerMs(tiebreakerMs ?? null)
            setWasPartial(false)
            setPhase('results')
          }}
        />
      )
    }

    return (
      <LegacyMinigameWrapper
        game={game}
        options={gameOptions}
        onComplete={handleComplete}
        onQuit={handleQuit}
      />
    )
  }

  return (
    <div
      className="minigame-host"
      role="dialog"
      aria-modal="true"
      aria-label={`${game.title} minigame`}
    >
      {phase !== 'results' && utilityView !== 'rules' && utilityView !== 'exit' && (
        <MinigameUtilityDock
          phase={phase}
          menuOpen={utilityView === 'menu'}
          onToggleMenu={() => setUtilityView((current) => (current === 'menu' ? null : 'menu'))}
          onCloseMenu={() => setUtilityView(null)}
          onOpenRules={() => setUtilityView('rules')}
          onRequestExit={() => setUtilityView('exit')}
        />
      )}

      {phase === 'rules' && (
        <MinigameRules
          game={rulesGame}
          onConfirm={handleRulesConfirm}
          onSkip={skipRules ? handleRulesConfirm : undefined}
        />
      )}

      {phase === 'countdown' && (
        <div className="minigame-host-ready">
          <span className="minigame-host-ready-label">Get Ready</span>
          <span className="minigame-host-ready-game">{game.title}</span>
          {countdown > 0 ? (
            <span className="minigame-host-ready-count" key={countdown}>
              {countdown}
            </span>
          ) : (
            <span className="minigame-host-ready-go">GO!</span>
          )}
        </div>
      )}

      {phase === 'playing' && <div className="minigame-host-playing">{renderActiveGame()}</div>}

      {utilityView === 'rules' && phase !== 'results' && (
        <MinigameRules
          game={rulesGame}
          mode="reference"
          confirmLabel={phase === 'countdown' ? 'Return to countdown' : 'Return to game'}
          onConfirm={() => setUtilityView(null)}
        />
      )}

      {utilityView === 'exit' && phase !== 'results' && (
        <div
          className="minigame-exit-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Leave competition confirmation"
        >
          <div className="minigame-exit-confirm">
            <p className="minigame-exit-confirm__eyebrow">Emergency exit</p>
            <h2 className="minigame-exit-confirm__title">Leave this competition?</h2>
            <p className="minigame-exit-confirm__copy">
              Your score will be recorded as 0. The remaining results will be simulated so the
              season can continue and a winner can still be selected.
            </p>
            <div className="minigame-exit-confirm__actions">
              <button
                type="button"
                className="minigame-exit-confirm__button minigame-exit-confirm__button--keep"
                onClick={() => setUtilityView(null)}
                autoFocus
              >
                Keep playing
              </button>
              <button
                type="button"
                className="minigame-exit-confirm__button minigame-exit-confirm__button--exit"
                onClick={handleConfirmEarlyExit}
              >
                Exit with 0
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'results' && (
        <div
          className={`minigame-host-results ${showTimeMachineResults ? 'minigame-host-results--timeline' : ''}`}
        >
          {showTimeMachineResults && (
            <div className="minigame-host-results-rift" aria-hidden="true" />
          )}
          {showTimeMachineResults && (
            <button
              type="button"
              className="minigame-host-results-close"
              aria-label="Close results"
              onClick={() => {
                if (showCompetitionRetry) competitionRetry?.onContinueWithoutRetry?.()
                handleContinue()
              }}
            >
              ×
            </button>
          )}
          {showTimeMachineResults && (
            <p className="minigame-host-results-kicker">
              {showOrganicLastPlace ? 'Alternative universe' : 'Temporal rupture'}
            </p>
          )}
          <h2 className="minigame-host-results-title">
            {showOrganicLastPlace ? 'Is this real?' : wasPartial ? 'Exited early' : '🏁 Finished!'}
          </h2>
          {showTimeMachineResults && (
            <div className="minigame-host-results-divider" aria-hidden="true">
              <span />
            </div>
          )}

          {leaderboard ? (
            <>
              {showTimeMachineResults && (
                <p className="minigame-host-results-alternate-timeline">
                  {showOrganicLastPlace
                    ? "A time shift seems to have opened an alternative universe, because somehow you finished last. You're definitely not a loser, so this must be a temporal rift. Use the time machine to set things straight."
                    : 'You slipped out of the timeline. While you were gone, the competition resolved in an alternate universe.'}
                </p>
              )}
              <p
                className={`minigame-host-results-winner ${showTimeMachineResults ? 'minigame-host-results-winner--timeline' : ''}`}
              >
                {showTimeMachineResults && (
                  <span className="minigame-host-results-trophy" aria-hidden="true">
                    🏆
                  </span>
                )}
                <span>
                  {leaderboard[0]?.name ?? 'Unknown'} wins
                  {leaderboard[0]?.isHuman ? " — that's you!" : '!'}
                </span>
              </p>
              <ol className="minigame-host-leaderboard">
                {leaderboard.map((entry, i) => (
                  <li
                    key={entry.id}
                    className={[
                      'minigame-host-leaderboard-entry',
                      entry.isHuman ? 'minigame-host-leaderboard-entry--you' : '',
                      i === 0 ? 'minigame-host-leaderboard-entry--winner' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="minigame-host-leaderboard-rank" aria-hidden="true">
                      {MEDALS[i] ?? `${i + 1}.`}
                    </span>
                    <span className="minigame-host-leaderboard-name">
                      {entry.name}
                      {entry.isHuman && (
                        <span className="minigame-host-leaderboard-you"> (You)</span>
                      )}
                    </span>
                    <span className="minigame-host-leaderboard-score">
                      {rankingOnly ? (
                        <>
                          {game.metricLabel}: <strong>{fmtOrdinal(i + 1)}</strong>
                        </>
                      ) : (
                        <>
                          {game.metricLabel}: <strong>{fmtScore(entry.score)}</strong>
                        </>
                      )}
                      {!rankingOnly && entry.isPR && (
                        <span className="minigame-host-leaderboard-pr" title="Personal Record!">
                          {' '}
                          🏅 PR
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="minigame-host-results-score">
              {game.metricLabel}: <strong>{fmtScore(finalValue ?? 0)}</strong>
              {wasPartial && ' (partial)'}
            </p>
          )}

          <div className="minigame-host-results-actions">
            {activeCompetitionRetry && (
              <div
                className="minigame-host-results-retry"
                role="group"
                aria-label="Competition retry"
              >
                <button
                  className="minigame-host-results-btn minigame-host-results-btn--retry"
                  onClick={() => activeCompetitionRetry.onWatch(handleRetryRestart)}
                  disabled={activeCompetitionRetry.pending}
                  autoFocus
                >
                  {activeCompetitionRetry.pending ? (
                    'Opening Ad…'
                  ) : (
                    <>
                      <span className="minigame-host-results-rewind" aria-hidden="true">
                        ◀◀
                      </span>
                      Reverse time
                    </>
                  )}
                </button>
                <p className="minigame-host-results-retry-copy">
                  Watch a short ad to retry before this result is locked in.
                </p>
              </div>
            )}

            {(!showTimeMachineResults || !showCompetitionRetry) && (
              <button
                className="minigame-host-results-btn"
                onClick={() => {
                  if (showCompetitionRetry) competitionRetry?.onContinueWithoutRetry?.()
                  handleContinue()
                }}
                {...(!showCompetitionRetry ? { autoFocus: true } : {})}
              >
                {showCompetitionRetry ? 'No Thanks — Continue ▶' : 'Continue ▶'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
