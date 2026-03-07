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
//
// MinigameHost passes onFinish so the reported score is forwarded to the host's
// results screen.  Extra optional props (width, height, autoStart, …) may be
// present on the component but are not required for generic mounting.

import type { ComponentType } from 'react';
import TiltedLedge from '../components/TiltedLedge/TiltedLedge';
import ClosestWithoutGoingOverComp from '../components/ClosestWithoutGoingOverComp';
import HoldTheWallComp from '../components/HoldTheWallComp/HoldTheWallComp';

/**
 * Minimal prop contract shared by all generic React minigame components.
 * Components mounted through this map must accept onFinish so that the
 * final score value can be forwarded to MinigameHost's results screen.
 */
export interface GenericMinigameProps {
  onFinish?: (value: number) => void;
}

const reactComponents: Record<string, ComponentType<GenericMinigameProps>> = {
  TiltedLedge: TiltedLedge as ComponentType<GenericMinigameProps>,
  ClosestWithoutGoingOver: ClosestWithoutGoingOverComp as ComponentType<GenericMinigameProps>,
  HoldTheWall: HoldTheWallComp as ComponentType<GenericMinigameProps>,
};

export default reactComponents;
