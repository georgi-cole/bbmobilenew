/**
 * QuickTapRace — compatibility re-export.
 *
 * The implementation has moved to the canvas-backed version at
 *   src/minigames/quickTapRace/QuickTapRaceCanvasGame.tsx
 *
 * This file is retained so that existing imports from
 *   '../../components/QuickTapRace/QuickTapRace'
 * (e.g. GameScreen) continue to work without modification.
 */
export { default } from '../../minigames/quickTapRace/QuickTapRaceCanvasGame';
