import type { LaneLayout, QuickTapRaceLayout } from './types';

export function buildQuickTapRaceLayout(
  width: number,
  height: number,
  dpr: number,
  laneCount: number,
): QuickTapRaceLayout {
  const safeWidth = Math.max(320, width);
  const safeHeight = Math.max(480, height);
  const paddingX = Math.min(24, safeWidth * 0.055);
  const paddingY = Math.min(28, safeHeight * 0.04);
  const headerHeight = Math.min(96, safeHeight * 0.12);
  const statusHeight = Math.min(62, safeHeight * 0.08);
  const tapZoneHeight = Math.min(150, safeHeight * 0.24);
  const trackHeight = Math.max(
    240,
    safeHeight - paddingY * 2 - headerHeight - statusHeight - tapZoneHeight - 12,
  );

  const headerRect = {
    x: paddingX,
    y: paddingY,
    width: safeWidth - paddingX * 2,
    height: headerHeight,
  };

  const trackRect = {
    x: paddingX,
    y: headerRect.y + headerRect.height + 8,
    width: safeWidth - paddingX * 2,
    height: trackHeight,
  };

  const statusRect = {
    x: paddingX,
    y: trackRect.y + trackRect.height + 8,
    width: safeWidth - paddingX * 2,
    height: statusHeight,
  };

  const tapZoneRect = {
    x: paddingX,
    y: statusRect.y + statusRect.height + 8,
    width: safeWidth - paddingX * 2,
    height: tapZoneHeight,
  };

  const trackStartX = trackRect.x + Math.max(24, trackRect.width * 0.055);
  const trackFinishX = trackRect.x + trackRect.width - Math.max(28, trackRect.width * 0.065);
  const laneGap = Math.max(14, trackRect.height * 0.05 / Math.max(1, laneCount));
  const laneHeight = Math.max(46, (trackRect.height - laneGap * Math.max(0, laneCount - 1)) / Math.max(1, laneCount));
  const racerRadius = Math.max(13, Math.min(20, laneHeight * 0.23));

  const lanes: LaneLayout[] = Array.from({ length: laneCount }, (_, index) => {
    const y = trackRect.y + index * (laneHeight + laneGap);
    return {
      x: trackRect.x,
      y,
      width: trackRect.width,
      height: laneHeight,
      centerX: trackRect.x + trackRect.width * 0.5,
      centerY: y + laneHeight * 0.5,
      racerRadius,
    };
  });

  return {
    width: safeWidth,
    height: safeHeight,
    dpr,
    paddingX,
    paddingY,
    headerRect,
    trackRect,
    tapZoneRect,
    statusRect,
    trackStartX,
    trackFinishX,
    laneGap,
    laneHeight,
    lanes,
  };
}
