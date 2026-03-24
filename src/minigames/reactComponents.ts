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
//   onFinish?: (value: number) => void
//   seed?: number        — competition seed forwarded from gameOptions.seed
//   autoStart?: boolean  — when true the game begins immediately on mount

import type { ComponentType } from 'react';
import TiltedLedge from '../components/TiltedLedge/TiltedLedge';
import ClosestWithoutGoingOverComp from '../components/ClosestWithoutGoingOverComp';
import HoldTheWallComp from '../components/HoldTheWallComp/HoldTheWallComp';
import CastleRescueGame from './castleRescue/CastleRescueGame';
import QuickTapRace from '../components/QuickTapRace/QuickTapRace';
import TravelingDots from '../components/TravelingDots/TravelingDots';
import EstimationGame from '../components/EstimationGame/EstimationGame';
import PressurePlank from '../components/PressurePlank/PressurePlank';

/**
 * Minimal prop contract shared by all generic React minigame components.
 * Components mounted through this map must accept onFinish so that the
 * final score value can be forwarded to MinigameHost's results screen.
 * seed and autoStart are forwarded from the host's gameOptions so that
 * seeded-RNG games start deterministically without an extra user click.
 */
export interface GenericMinigameProps {
  onFinish?: (value: number) => void;
  /** Deterministic competition seed forwarded from gameOptions.seed. */
  seed?: number;
  /** When true the game starts immediately on mount (no Start button needed). */
  autoStart?: boolean;
}

const reactComponents: Record<string, ComponentType<GenericMinigameProps>> = {
  TiltedLedge: TiltedLedge as ComponentType<GenericMinigameProps>,
  ClosestWithoutGoingOver: ClosestWithoutGoingOverComp as ComponentType<GenericMinigameProps>,
  HoldTheWall: HoldTheWallComp as ComponentType<GenericMinigameProps>,
  CastleRescue: CastleRescueGame as ComponentType<GenericMinigameProps>,
  QuickTapRace: QuickTapRace as ComponentType<GenericMinigameProps>,
  TravelingDots: TravelingDots as ComponentType<GenericMinigameProps>,
  EstimationGame: EstimationGame as ComponentType<GenericMinigameProps>,
  PressurePlank: PressurePlank as ComponentType<GenericMinigameProps>,
};

export default reactComponents;
