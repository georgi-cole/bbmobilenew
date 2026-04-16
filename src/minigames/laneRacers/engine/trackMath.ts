import type { QuickTapRaceLayout } from './types';

export function getTrackX(layout: QuickTapRaceLayout, progress: number): number {
  return layout.trackStartX + (layout.trackFinishX - layout.trackStartX) * progress;
}

export function getLaneCenterY(layout: QuickTapRaceLayout, laneIndex: number): number {
  return layout.lanes[laneIndex]?.centerY ?? layout.trackRect.y + layout.trackRect.height * 0.5;
}
