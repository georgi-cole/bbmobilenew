// MODULE: src/minigames/reactComponents.ts
// Registry map of reactComponentKey → React component for React-implemented minigames.
//
// MinigameHost uses this map to generically mount any game whose registry entry
// has  implementation: 'react'  and a  reactComponentKey  that is NOT already
// handled by a dedicated special-case branch (e.g. ClosestWithoutGoingOver,
// HoldTheWall, BiographyBlitz).
//
// Component contract for generic mounting
// ─────────────────────────────────────────
// Each component in this map must accept (at minimum):
//   onFinish?: (
//                value: number,
//                tiebreakerMs?: number,
//                completion?: {
//                  authoritativeWinnerId?: string | null,
//                  rawValue?: number,
//                  rawResults?: Record<string, number>,
//                  tiebreakerMs?: number,
//                },
//              ) => void
//                        — called with the final score; tiebreakerMs is an
//                          optional secondary sort key (lower = faster = better),
//                          completion.authoritativeWinnerId preserves a
//                          minigame-declared winner through MinigameHost, and
//                          rawValue/rawResults carry authoritative result data
//   seed?: number        — competition seed forwarded from gameOptions.seed
//   autoStart?: boolean  — when true the game begins immediately on mount

import type { ComponentType } from 'react';
import TiltedLedge from '../components/TiltedLedge/TiltedLedge';
import ClosestWithoutGoingOverComp from '../components/ClosestWithoutGoingOverComp';
import HoldTheWallComp from '../components/HoldTheWallComp/HoldTheWallComp';
import CastleRescueGame from './castleRescue/CastleRescueGame';
import QuickTapRace from './quickTapRace/QuickTapRaceCanvasGame';
import TravelingDots from '../components/TravelingDots/TravelingDots';
import EstimationGame from '../components/EstimationGame/EstimationGame';
import BullseyeBlitz from '../components/BullseyeBlitz/BullseyeBlitz';
import ColorMatchComp from '../components/ColorMatchComp/ColorMatchComp';
import SnakeGame from '../components/SnakeGame/SnakeGame';
import RescueTheKingGame from './rescueTheKing/RescueTheKingGame';
import TrapAuction from '../components/TrapAuction/TrapAuction';
import TimingBar from '../components/TimingBar/TimingBar';
import Minesweeps from '../components/Minesweeps/Minesweeps';
import HangmanChallengeComp from '../components/HangmanChallengeComp/HangmanChallengeComp';
import NumberTrivia from '../components/NumberTrivia/NumberTrivia';
import CodeBreakerComp from '../components/CodeBreakerComp/CodeBreakerComp';
import GridOfLuck from '../components/GridOfLuck/GridOfLuck';

/**
 * Minimal prop contract shared by all generic React minigame components.
 * Components mounted through this map must accept onFinish so that the
 * final score value can be forwarded to MinigameHost's results screen.
 * seed and autoStart are forwarded from the host's gameOptions so that
 * seeded-RNG games start deterministically without an extra user click.
 */
export interface GenericMinigameProps {
  onFinish?: (
    value: number,
    tiebreakerMs?: number,
    completion?: {
      authoritativeWinnerId?: string | null;
      rawValue?: number;
      rawResults?: Record<string, number>;
      tiebreakerMs?: number;
    },
  ) => void;
  /** Deterministic competition seed forwarded from gameOptions.seed. */
  seed?: number;
  /** When true the game starts immediately on mount (no Start button needed). */
  autoStart?: boolean;
  /** Authoritative participant ids forwarded from MinigameHost for hosted competitions. */
  participantIds?: string[];
  /** Full participant records forwarded when a game needs names/AI scoreboard data. */
  participants?: Array<{
    id: string;
    name: string;
    isHuman: boolean;
    avatar?: string;
    precomputedScore: number;
    previousPR: number | null;
  }>;
}

const reactComponents: Record<string, ComponentType<GenericMinigameProps>> = {
  TiltedLedge: TiltedLedge as ComponentType<GenericMinigameProps>,
  ClosestWithoutGoingOver: ClosestWithoutGoingOverComp as ComponentType<GenericMinigameProps>,
  HoldTheWall: HoldTheWallComp as ComponentType<GenericMinigameProps>,
  CastleRescue: CastleRescueGame as ComponentType<GenericMinigameProps>,
  QuickTapRace: QuickTapRace as ComponentType<GenericMinigameProps>,
  TravelingDots: TravelingDots as ComponentType<GenericMinigameProps>,
  EstimationGame: EstimationGame as ComponentType<GenericMinigameProps>,
  BullseyeBlitz: BullseyeBlitz as ComponentType<GenericMinigameProps>,
  ColorMatch: ColorMatchComp as ComponentType<GenericMinigameProps>,
  SnakeGame: SnakeGame as ComponentType<GenericMinigameProps>,
  RescueTheKing: RescueTheKingGame as ComponentType<GenericMinigameProps>,
  TrapAuction: TrapAuction as ComponentType<GenericMinigameProps>,
  TimingBar: TimingBar as ComponentType<GenericMinigameProps>,
  Minesweeps: Minesweeps as ComponentType<GenericMinigameProps>,
  HangmanChallenge: HangmanChallengeComp as ComponentType<GenericMinigameProps>,
  NumberTrivia: NumberTrivia as ComponentType<GenericMinigameProps>,
  CodeBreaker: CodeBreakerComp as ComponentType<GenericMinigameProps>,
  GridOfLuck: GridOfLuck as ComponentType<GenericMinigameProps>,
};

export default reactComponents;
