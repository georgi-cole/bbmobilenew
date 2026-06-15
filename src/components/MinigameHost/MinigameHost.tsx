// MODULE: src/components/MinigameHost/MinigameHost.tsx
// Full-screen host for minigames (legacy and React-implemented).
//
// Flow:
//   1. Rules modal  (unless skipRules is true)
//   2. 3-second "Get Ready" countdown
//   3. Minigame — either a React component (e.g. ClosestWithoutGoingOverComp)
//      or a legacy bundle via LegacyMinigameWrapper
//   4. Results screen  → calls onDone(rawValue)
//      Note: React-implemented games (implementation === 'react') show their own
//      results screen and call onDone directly when complete, skipping step 4.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { isPlacementRankingGame, type GameRegistryEntry } from '../../minigames/registry';
import MinigameRules from '../MinigameRules/MinigameRules';
import LegacyMinigameWrapper from '../../minigames/LegacyMinigameWrapper';
import type { LegacyRawResult } from '../../minigames/LegacyMinigameWrapper';
import { SoundManager } from '../../services/sound/SoundManager';
import ClosestWithoutGoingOverComp from '../ClosestWithoutGoingOverComp';
import type { CwgoPrizeType } from '../../features/cwgo/cwgoCompetitionSlice';
import HoldTheWallComp from '../HoldTheWallComp/HoldTheWallComp';
import type { HoldTheWallPrizeType } from '../../features/holdTheWall/holdTheWallSlice';
import BiographyBlitzComp from '../BiographyBlitzComp/biography_blitz_game';
import type { BiographyBlitzCompetitionType } from '../../features/biographyBlitz/biography_blitz_logic';
import FamousFiguresComp from '../FamousFiguresComp/FamousFiguresComp';
import type { FamousFiguresPrizeType } from '../../features/famousFigures/famousFiguresSlice';
import SilentSaboteurComp from '../SilentSaboteurComp/SilentSaboteurComp';
import type { SilentSaboteurPrizeType } from '../../features/silentSaboteur/silentSaboteurSlice';
import MajorityRulesComp from '../MajorityRulesComp/MajorityRulesComp';
import type { MajorityRulesCompetitionType } from '../../features/majorityRules/majorityRulesSlice';
import { buildGlassBridgeTimeLimitMs } from '../../features/glassBridge/glassBridgeSlice';
import GlassBridgeComp from '../GlassBridgeComp/GlassBridgeComp';
import CrystalPathShatteredGame from '../../minigames/crystalPathShattered/CrystalPathShatteredGame';
import BlackjackTournamentComp from '../BlackjackTournamentComp/BlackjackTournamentComp';
import type { BlackjackTournamentCompetitionType } from '../../features/blackjackTournament/blackjackTournamentSlice';
import RiskWheelComp from '../RiskWheelComp/RiskWheelComp';
import type { RiskWheelCompetitionType } from '../../features/riskWheel/riskWheelSlice';
import WildcardWesternComp from '../WildcardWesternComp/WildcardWesternComp';
import CodeBreakerComp from '../CodeBreakerComp/CodeBreakerComp';
import type { CodeBreakerPrizeType } from '../CodeBreakerComp/CodeBreakerComp';
import TetrisComp from '../TetrisComp/TetrisComp';
import type { TetrisPrizeType } from '../../features/tetris/tetrisSlice';
import TiltLabyrinthComp from '../TiltLabyrinthComp/TiltLabyrinthComp';
import type { TiltLabyrinthPrizeType } from '../../features/tiltLabyrinth/tiltLabyrinthSlice';
import HouseOfCardsComp from '../HouseOfCardsComp/HouseOfCardsComp';
import type { HouseOfCardsPrizeType } from '../../features/houseOfCards/houseOfCardsSlice';
import MemoryColorsComp from '../MemoryColorsComp/MemoryColorsComp';
import type { MemoryColorsCompetitionType } from '../../features/memoryColors/memoryColorsSlice';
import TrapAuctionComp from '../TrapAuction/TrapAuction';
import ColorMatchComp from '../ColorMatchComp/ColorMatchComp';
import reactComponents from '../../minigames/reactComponents';
import './MinigameHost.css';

const COUNTDOWN_TIMER_KEY = 'minigame:all_3_seconds_timer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MinigameParticipant {
  id: string;
  name: string;
  isHuman: boolean;
  avatar?: string;
  /** Pre-computed raw score for AI players; ignored for the human (finalValue is used). */
  precomputedScore: number;
  /** Previous personal-record value for this game, using the game's native metric
   * (same units/scale as the raw rounded game score). Null = no prior record. */
  previousPR: number | null;
}

export interface ReactMinigameCompletion {
  authoritativeWinnerId?: string | null;
  rawValue?: number;
  rawResults?: Record<string, number>;
  /** Optional time-based tie-breaker in ms (lower = faster = better rank). */
  tiebreakerMs?: number;
}

interface Props {
  game: GameRegistryEntry;
  /** Options forwarded to the legacy module (e.g. seed, timeLimit). */
  gameOptions?: Record<string, unknown>;
  /**
   * Called when the minigame ends (normally or via quit).
   * rawValue is the primary metric reported by the game.
   */
  onDone: (rawValue: number, partial?: boolean, completion?: ReactMinigameCompletion) => void;
  /** When true the rules modal is skipped and countdown starts immediately. */
  skipRules?: boolean;
  /** When true the 3-second countdown is skipped (for testing). */
  skipCountdown?: boolean;
  /**
   * All competition participants (human + AI).  When provided, the results
   * screen shows a full ranked leaderboard instead of the human's score alone.
   */
  participants?: MinigameParticipant[];
  competitionRetry?: {
    enabled: boolean;
    pending?: boolean;
    onWatch: (onReward: () => void) => void;
    onContinueWithoutRetry?: () => void;
  };
}

type HostPhase = 'rules' | 'countdown' | 'playing' | 'results';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Round a raw game score to an integer for display. */
function fmtScore(value: number): string {
  return String(Math.round(value));
}

function fmtOrdinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  const mod10 = value % 10;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MinigameHost({
  game,
  gameOptions = {},
  onDone,
  skipRules = false,
  skipCountdown = false,
  participants,
  competitionRetry,
}: Props) {
  const [phase, setPhase] = useState<HostPhase>(skipRules ? 'countdown' : 'rules');
  const [countdown, setCountdown] = useState(3);
  const [finalValue, setFinalValue] = useState<number | null>(null);
  const [finalTiebreakerMs, setFinalTiebreakerMs] = useState<number | null>(null);
  const [wasPartial, setWasPartial] = useState(false);
  const rankingOnly = isPlacementRankingGame(game);
  const competitionRetryEnabled = competitionRetry?.enabled ?? false;
  const rulesGame = useMemo(
    () =>
      game.key === 'glass_bridge_brutal'
        ? {
            ...game,
            timeLimitMs: buildGlassBridgeTimeLimitMs((participants ?? []).length),
          }
        : game,
    [game, participants],
  );

  // ── Rules confirmed ─────────────────────────────────────────────────────
  const handleRulesConfirm = useCallback(() => {
    setPhase('countdown');
  }, []);

  // ── Dismiss challenge from rules (score 0) ───────────────────────────────
  // Routes through the results screen so the player sees "Exited Early" and
  // must explicitly confirm via the Continue button.  This prevents accidental
  // dismissal from silently crowning a winner without any user feedback.
  const handleRulesDismiss = useCallback(() => {
    setFinalValue(0);
    setWasPartial(true);
    setPhase('results');
  }, []);

  // ── Countdown ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (skipCountdown) {
      const t = setTimeout(() => setPhase('playing'), 0);
      return () => clearTimeout(t);
    }
    if (countdown <= 0) {
      // Show "GO!" briefly then start
      const t = setTimeout(() => setPhase('playing'), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, skipCountdown]);

  // Play the 3-second countdown timer sound once when the countdown starts.
  useEffect(() => {
    if (phase !== 'countdown' || skipCountdown) return;
    void SoundManager.play(COUNTDOWN_TIMER_KEY);
  }, [phase, skipCountdown]);

  // ── Game complete (legacy) ───────────────────────────────────────────────
  const handleComplete = useCallback((result: LegacyRawResult) => {
    setFinalValue(result.value);
    setWasPartial(false);
    setPhase('results');
  }, []);

  // ── Quit / partial (legacy) ──────────────────────────────────────────────
  const handleQuit = useCallback((partial: LegacyRawResult) => {
    setFinalValue(partial.value);
    setWasPartial(true);
    setPhase('results');
  }, []);

  // ── React minigame complete (e.g. CWGO) — skip host results screen ───────
  // CWGO dispatches resolveCompetitionOutcome() before calling onComplete, so
  // the competition result is already stored in Redux. We call onDone(1) as a
  // sentinel to signal completion to the parent — the actual winner is
  // determined by the Redux state, not this value.
  const handleReactComplete = useCallback((completion?: ReactMinigameCompletion) => {
    onDone(completion?.rawValue ?? 1, false, completion);
  }, [onDone]);

  // ── Continue from results ────────────────────────────────────────────────
  const handleContinue = useCallback(() => {
    const completion: ReactMinigameCompletion | undefined =
      finalTiebreakerMs != null
        ? {
            tiebreakerMs: finalTiebreakerMs,
          }
        : undefined;
    if (completion != null) {
      onDone(finalValue ?? 0, wasPartial, completion);
    } else {
      onDone(finalValue ?? 0, wasPartial);
    }
  }, [finalTiebreakerMs, finalValue, onDone, wasPartial]);

  // ── Build leaderboard when participants are provided ─────────────────────
  const leaderboard = useMemo(() => {
    if (!participants || participants.length === 0) return null;
    const humanScore = finalValue ?? 0;
    const lowerBetter = game.scoringAdapter === 'lowerBetter';
    const entries = participants.map((p) => {
      const score = p.isHuman ? humanScore : p.precomputedScore;
      const isPR =
        p.previousPR === null ||
        (lowerBetter ? score < p.previousPR : score > p.previousPR);
      return { ...p, score, isPR };
    });
    entries.sort((a, b) => {
      // Scope the forced-last partial handling to the competition retry flow so
      // non-retry result leaderboards keep their original ranking behavior.
      if (competitionRetryEnabled && wasPartial) {
        if (a.isHuman !== b.isHuman) return a.isHuman ? 1 : -1;
      }
      // Sort: lower-is-better adapters sort ascending; all others sort descending.
      return lowerBetter ? a.score - b.score : b.score - a.score;
    });
    return entries;
  }, [competitionRetryEnabled, participants, finalValue, game.scoringAdapter, wasPartial]);
  const humanLastPlaceEntry = leaderboard?.[leaderboard.length - 1] ?? null;
  const showCompetitionRetry =
    competitionRetryEnabled && !!humanLastPlaceEntry?.isHuman;
  const activeCompetitionRetry =
    showCompetitionRetry && competitionRetry ? competitionRetry : null;

  const handleRetryRestart = useCallback(() => {
    setFinalValue(null);
    setFinalTiebreakerMs(null);
    setWasPartial(false);
    setCountdown(3);
    setPhase(skipCountdown ? 'playing' : 'countdown');
  }, [skipCountdown]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="minigame-host" role="dialog" aria-modal="true" aria-label={`${game.title} minigame`}>
      {phase === 'rules' && (
        <MinigameRules
          game={rulesGame}
          onConfirm={handleRulesConfirm}
          onSkip={skipRules ? handleRulesConfirm : undefined}
          onDismiss={handleRulesDismiss}
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

      {phase === 'playing' && (
        <div className="minigame-host-playing">
          {/* Top-right close button — exits the minigame early (partial).
              Routes through the results screen so the player must explicitly
              confirm via Continue ▶ before a winner is applied. */}
          <button
            className="minigame-host-close-btn"
            onClick={() => {
              setFinalValue(0);
              setWasPartial(true);
              setPhase('results');
            }}
            aria-label="Exit minigame"
            title="Exit minigame"
          >
            ✕
          </button>
          {(() => {
            const participantIds = (participants ?? []).map((p) => p.id);
            const seed = typeof gameOptions?.seed === 'number' ? gameOptions.seed : 0;
            if (game.implementation === 'react' && game.reactComponentKey === 'ClosestWithoutGoingOver') {
              return (
                <ClosestWithoutGoingOverComp
                  participantIds={participantIds}
                  prizeType={gameOptions?.prizeType as CwgoPrizeType}
                  seed={seed}
                  onComplete={handleReactComplete}
                />
              );
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
              );
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
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'FamousFigures') {
              return (
                <FamousFiguresComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as FamousFiguresPrizeType}
                  seed={seed}
                  onComplete={handleReactComplete}
                  skipWinnerAnimation={true}
                />
              );
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
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'MajorityRules') {
              // seed is intentionally NOT forwarded to MajorityRulesComp.
              // In normal gameplay the challenge seed is a deterministic value derived
              // from game.seed — passing it would cause the same question sequence to
              // repeat whenever the same game.seed is active (e.g. after a page reload).
              // MajorityRulesComp generates a fresh crypto-random seed on mount so each
              // new session draws questions in a unique, unpredictable order.
              if (import.meta.env.DEV) {
                console.log('MAJORITY_RULES_NEW_SESSION', {
                  source: 'MinigameHost',
                  challengeSeedIgnored: seed,
                  participantIds,
                  prizeType: gameOptions?.prizeType ?? 'LOH',
                });
              }
              return (
                <MajorityRulesComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as MajorityRulesCompetitionType ?? 'LOH'}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'GlassBridge') {
              // seed is intentionally NOT forwarded to GlassBridgeComp.
              // In normal gameplay the challenge seed is a deterministic value derived
              // from game.seed — passing it would cause the same bridge layout and
              // number-order shuffle to repeat whenever the same game.seed is active
              // (e.g. after a page reload or restart).
              // GlassBridgeComp generates a fresh crypto-random session seed on mount
              // so each new Crystal Path run stays unpredictable.
              if (import.meta.env.DEV) {
                console.log('GLASS_BRIDGE_NEW_SESSION', {
                  source: 'MinigameHost',
                  challengeSeedIgnored: seed,
                  participantIds,
                  prizeType: gameOptions?.prizeType ?? 'LOH',
                });
              }
              return (
                <GlassBridgeComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as 'LOH' | 'POS' | undefined}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'CrystalPathShattered') {
              if (import.meta.env.DEV) {
                console.log('CRYSTAL_PATH_SHATTERED_NEW_SESSION', {
                  source: 'MinigameHost',
                  challengeSeedIgnored: seed,
                  participantIds,
                  prizeType: gameOptions?.prizeType ?? 'LOH',
                });
              }
              return (
                <CrystalPathShatteredGame
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as 'LOH' | 'POS' | undefined}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'BlackjackTournament') {
              return (
                <BlackjackTournamentComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as BlackjackTournamentCompetitionType ?? 'LOH'}
                  seed={seed}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'RiskWheel') {
              // seed is intentionally NOT forwarded to RiskWheelComp.
              // In normal gameplay the challenge seed is a deterministic value derived
              // from game.seed — passing it would cause the same spin sequence to
              // repeat whenever the same game.seed is active (e.g. after a page reload).
              // RiskWheelComp's init effect passes seed:undefined to initRiskWheel so
              // the prepare() callback always generates a fresh crypto-random seed.
              if (import.meta.env.DEV) {
                console.log('RISK_WHEEL_NEW_SESSION', {
                  source: 'MinigameHost',
                  challengeSeedIgnored: seed,
                  participantIds,
                  prizeType: gameOptions?.prizeType ?? 'LOH',
                });
              }
              return (
                <RiskWheelComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as RiskWheelCompetitionType ?? 'LOH'}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'WildcardWestern') {
              return (
                <WildcardWesternComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as 'LOH' | 'POS' ?? 'LOH'}
                  seed={seed}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'CodeBreaker') {
              return (
                <CodeBreakerComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as CodeBreakerPrizeType ?? 'LOH'}
                  seed={seed}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'Tetris') {
              return (
                <TetrisComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as TetrisPrizeType ?? 'LOH'}
                  seed={seed}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'HouseOfCards') {
              // seed is intentionally NOT forwarded to HouseOfCardsComp.
              // In normal gameplay the challenge seed is a deterministic value derived
              // from game.seed — passing it would cause the same card layout to
              // repeat whenever the same game.seed is active (e.g. after a page reload).
              // HouseOfCardsComp generates a fresh crypto-random session seed on mount
              // so each new session shuffles the board and AI simulation uniquely.
              if (import.meta.env.DEV) {
                console.log('HOUSE_OF_CARDS_NEW_SESSION', {
                  source: 'MinigameHost',
                  challengeSeedIgnored: seed,
                  participantIds,
                  prizeType: gameOptions?.prizeType ?? 'LOH',
                });
              }
              return (
                <HouseOfCardsComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as HouseOfCardsPrizeType ?? 'LOH'}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'TiltLabyrinth') {
              return (
                <TiltLabyrinthComp
                  key={`tilt-labyrinth:${seed}:${gameOptions?.prizeType as string ?? 'LOH'}:${participantIds.join(',')}`}
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as TiltLabyrinthPrizeType ?? 'LOH'}
                  seed={seed}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'MemoryColors') {
              return (
                <MemoryColorsComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as MemoryColorsCompetitionType ?? 'LOH'}
                  seed={seed}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'TrapAuction') {
              return (
                <TrapAuctionComp
                  participantIds={participantIds}
                  participants={participants}
                  prizeType={gameOptions?.prizeType as 'LOH' | 'POS' ?? 'LOH'}
                  seed={seed}
                  autoStart={true}
                  onComplete={handleReactComplete}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'ColorMatch') {
              // seed is intentionally NOT forwarded to ColorMatchComp.
              // In normal gameplay the challenge seed is a deterministic value derived
              // from game.seed — passing it would cause the same color sequence to
              // repeat whenever the same game.seed is active (e.g. after a page reload).
              // ColorMatchComp generates a fresh crypto-random session seed when the
              // seed prop is absent/zero, ensuring each session has a unique color order.
              if (import.meta.env.DEV) {
                console.log('COLOR_MATCH_NEW_SESSION', {
                  source: 'MinigameHost',
                  challengeSeedIgnored: seed,
                  participantIds,
                  prizeType: gameOptions?.prizeType ?? 'LOH',
                });
              }
              return (
                <ColorMatchComp
                  autoStart={true}
                  participantIds={participantIds}
                  participants={participants}
                  onFinish={(value: number, tiebreakerMs?: number, completion?: ReactMinigameCompletion) => {
                    if (completion?.authoritativeWinnerId) {
                      onDone(value, false, completion);
                      return;
                    }
                    setFinalValue(value);
                    setFinalTiebreakerMs(tiebreakerMs ?? null);
                    setWasPartial(false);
                    setPhase('results');
                  }}
                />
              );
            }
            if (game.implementation === 'react' && game.reactComponentKey === 'Capitalization') {
              // Capitalization should draw a fresh geography set for each hosted run.
              // The challenge seed is stable for a pending challenge, so forwarding it
              // makes repeated app/browser starts land on the same first country.
              const CapitalizationComp = reactComponents.Capitalization;
              return (
                <CapitalizationComp
                  autoStart={true}
                  participantIds={participantIds}
                  participants={participants}
                  onFinish={(value: number, tiebreakerMs?: number, completion?: ReactMinigameCompletion) => {
                    if (game.scoringAdapter === 'authoritative' || completion?.authoritativeWinnerId) {
                      onDone(value, false, completion);
                      return;
                    }
                    setFinalValue(value);
                    setFinalTiebreakerMs(tiebreakerMs ?? null);
                    setWasPartial(false);
                    setPhase('results');
                  }}
                />
              );
            }
            if (game.implementation === 'react') {
              const key = game.reactComponentKey;
              if (!key) {
                throw new Error(
                  `[MinigameHost] game '${game.key}' has implementation 'react' but no reactComponentKey defined. ` +
                    `React-implemented games must define reactComponentKey.`,
                );
              }
              const GenericComp = reactComponents[key];
              if (!GenericComp) {
                throw new Error(
                  `[MinigameHost] reactComponentKey '${key}' not found in reactComponents map. ` +
                    `Add it to src/minigames/reactComponents.ts. ` +
                    `React-implemented games (implementation === 'react') should not use LegacyMinigameWrapper.`,
                );
              }
              return (
                <GenericComp
                  seed={seed}
                  autoStart={key !== 'HangmanChallenge'}
                  participantIds={participantIds}
                  participants={participants}
                  onFinish={(value: number, tiebreakerMs?: number, completion?: ReactMinigameCompletion) => {
                    if (game.scoringAdapter === 'authoritative' || completion?.authoritativeWinnerId) {
                      onDone(value, false, completion);
                      return;
                    }
                    setFinalValue(value);
                    setFinalTiebreakerMs(tiebreakerMs ?? null);
                    setWasPartial(false);
                    setPhase('results');
                  }}
                />
              );
            }
            return (
              <LegacyMinigameWrapper
                game={game}
                options={gameOptions}
                onComplete={handleComplete}
                onQuit={handleQuit}
              />
            );
          })()}
        </div>
      )}

      {phase === 'results' && (
        <div className="minigame-host-results">
          <h2 className="minigame-host-results-title">
            {wasPartial ? '🚪 Exited Early' : '🏁 Finished!'}
          </h2>

          {leaderboard ? (
            <>
              <p className="minigame-host-results-winner">
                🏆 {leaderboard[0]?.name ?? 'Unknown'} wins
                {leaderboard[0]?.isHuman ? " — that's you!" : '!'}
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
                          {' '}🏅 PR
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

          {activeCompetitionRetry && (
            <div className="minigame-host-results-retry" role="group" aria-label="Competition retry">
              <p className="minigame-host-results-retry-copy">
                Finished last? Watch a short ad to retry before the result is locked in.
              </p>
              <button
                className="minigame-host-results-btn minigame-host-results-btn--retry"
                onClick={() => activeCompetitionRetry.onWatch(handleRetryRestart)}
                disabled={activeCompetitionRetry.pending}
                autoFocus
              >
                {activeCompetitionRetry.pending ? 'Opening Ad…' : 'Watch Ad to Retry'}
              </button>
            </div>
          )}

          <button
            className="minigame-host-results-btn"
            onClick={() => {
              if (showCompetitionRetry) {
                competitionRetry?.onContinueWithoutRetry?.();
              }
              handleContinue();
            }}
            {...(!showCompetitionRetry ? { autoFocus: true } : {})}
          >
            {showCompetitionRetry ? 'No Thanks — Continue ▶' : 'Continue ▶'}
          </button>
        </div>
      )}
    </div>
  );
}
