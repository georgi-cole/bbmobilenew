const MIN_SCREEN_MARGIN = 16;
const MAX_SCREEN_MARGIN = 24;
const MIN_TEXT_WIDTH = 176;
const MIN_TEXT_HALF_WIDTH = MIN_TEXT_WIDTH * 0.5;
const MIN_BEAM_PADDING = 40;
const MAX_BEAM_PADDING = 56;
const MIN_TEXT_DISTANCE_RATIO = 0.16;
const MAX_TEXT_DISTANCE_RATIO = 0.48;
const TARGET_TEXT_Y_RATIO = 0.55;
const MIN_TEXT_DISTANCE = 120;
const MAX_TEXT_DISTANCE = 260;
const PREFERRED_TEXT_WIDTH_RATIO = 0.46;
const MIN_PREFERRED_TEXT_WIDTH = 180;
const MAX_PREFERRED_TEXT_WIDTH = 208;
// Clamp the interpolation ratio so trapezoid math stays stable even when the
// mask only extends slightly beyond the current credit text.
const MIN_MASK_TEXT_RATIO = 0.36;
const MAX_MASK_TEXT_RATIO = 0.9;
const MIN_MOON_RADIUS = 36;
const MAX_MOON_RADIUS = 44;
const MOON_PADDING = 14;

export type CreditTextPlacement = {
  textX: number;
  textY: number;
  textDistance: number;
  minTextDistance: number;
  maxTextDistance: number;
  maxTextWidth: number;
  baseFontSize: number;
  lineHeight: number;
  beamPadding: number;
  screenMargin: number;
};

export type VisibleBeamDimensions = {
  outerNearWidth: number;
  outerFarWidth: number;
  innerNearWidth: number;
  innerFarWidth: number;
};

export type TextRevealMaskDimensions = {
  nearWidth: number;
  farWidth: number;
};

export type MoonExclusionZone = {
  x: number;
  y: number;
  radius: number;
  padding: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function solveFarWidth(
  nearWidth: number,
  requiredWidthAtText: number,
  textDistance: number,
  beamLength: number,
): number {
  const distanceRatio = clamp(textDistance / beamLength, MIN_MASK_TEXT_RATIO, MAX_MASK_TEXT_RATIO);
  const requiredWidth = Math.max(requiredWidthAtText, nearWidth + 1);
  return Math.ceil(nearWidth + ((requiredWidth - nearWidth) / distanceRatio));
}

export function getBeamWidthAtDistance(
  nearWidth: number,
  farWidth: number,
  textDistance: number,
  beamLength: number,
): number {
  const distanceRatio = clamp(textDistance / beamLength, 0, 1);
  return nearWidth + (farWidth - nearWidth) * distanceRatio;
}

export function getMoonExclusionZone(screenWidth: number, screenHeight: number): MoonExclusionZone {
  return {
    x: screenWidth * 0.24,
    y: Math.max(screenHeight * 0.54, 440),
    radius: clamp(screenWidth * 0.09, MIN_MOON_RADIUS, MAX_MOON_RADIUS),
    padding: MOON_PADDING,
  };
}

export function textBlockIntersectsMoonZone(
  textX: number,
  textY: number,
  textWidth: number,
  textHeight: number,
  moonZone: MoonExclusionZone,
): boolean {
  const halfWidth = textWidth * 0.5;
  const halfHeight = textHeight * 0.5;
  const nearestX = clamp(moonZone.x, textX - halfWidth, textX + halfWidth);
  const nearestY = clamp(moonZone.y, textY - halfHeight, textY + halfHeight);
  const dx = moonZone.x - nearestX;
  const dy = moonZone.y - nearestY;
  const radius = moonZone.radius + moonZone.padding;
  // Compare squared distances to avoid an unnecessary square-root on every layout pass.
  return (dx * dx) + (dy * dy) < radius * radius;
}

export function getCreditTextPlacement(options: {
  screenWidth: number;
  screenHeight: number;
  designScale: number;
  beamOriginX: number;
  beamOriginY: number;
  beamAngle: number;
  beamLength: number;
}): CreditTextPlacement {
  const dx = Math.cos(options.beamAngle);
  const dy = Math.sin(options.beamAngle);
  const screenMargin = clamp(options.screenWidth * 0.05, MIN_SCREEN_MARGIN, MAX_SCREEN_MARGIN);
  const preferredTextWidth = clamp(
    options.screenWidth * PREFERRED_TEXT_WIDTH_RATIO,
    MIN_PREFERRED_TEXT_WIDTH,
    MAX_PREFERRED_TEXT_WIDTH,
  );
  const targetTextY = Math.max(options.screenHeight * TARGET_TEXT_Y_RATIO, 360);
  const minTextDistance = Math.max(options.screenHeight * MIN_TEXT_DISTANCE_RATIO, MIN_TEXT_DISTANCE);
  const maxTextDistance = Math.min(
    options.beamLength * MAX_TEXT_DISTANCE_RATIO,
    MAX_TEXT_DISTANCE,
  );
  let textDistance = clamp(
    (targetTextY - options.beamOriginY) / dy,
    minTextDistance,
    maxTextDistance,
  );

  let textX = options.beamOriginX + dx * textDistance;
  const minimumTextCenter = screenMargin + MIN_TEXT_HALF_WIDTH;

  if (textX < minimumTextCenter) {
    textDistance = clamp(
      (minimumTextCenter - options.beamOriginX) / dx,
      minTextDistance,
      maxTextDistance,
    );
    textX = options.beamOriginX + dx * textDistance;
  }

  const textY = options.beamOriginY + dy * textDistance;
  const availableHalfWidth = Math.max(
    MIN_TEXT_HALF_WIDTH,
    Math.min(textX - screenMargin, options.screenWidth - textX - screenMargin),
  );

  return {
    textX,
    textY,
    textDistance,
    minTextDistance,
    maxTextDistance,
    maxTextWidth: Math.floor(Math.min(
      preferredTextWidth,
      options.screenWidth - screenMargin * 2,
      availableHalfWidth * 2,
    )),
    baseFontSize: Math.max(19, Math.round(23 * options.designScale)),
    lineHeight: Math.max(28, Math.round(34 * options.designScale)),
    beamPadding: Math.round(clamp(options.screenWidth * 0.12, MIN_BEAM_PADDING, MAX_BEAM_PADDING)),
    screenMargin,
  };
}

export function getVisibleBeamDimensions(screenWidth: number): VisibleBeamDimensions {
  const outerFarWidth = Math.round(clamp(screenWidth * 0.3, 106, screenWidth * 0.33));
  const innerFarWidth = Math.round(outerFarWidth * 0.54);

  return {
    outerNearWidth: 8,
    outerFarWidth,
    innerNearWidth: 4,
    innerFarWidth: Math.max(innerFarWidth, 60),
  };
}

export function getTextRevealMaskDimensions(options: {
  screenWidth: number;
  textWidth: number;
  textHeight: number;
  textDistance: number;
  maskLength: number;
  beamPadding: number;
}): TextRevealMaskDimensions {
  const nearWidth = 16;
  const diagonalAllowance = Math.max(22, Math.min(34, options.textHeight * 0.42));
  const targetWidthAtText = options.textWidth + options.beamPadding + diagonalAllowance;

  return {
    nearWidth,
    farWidth: Math.max(
      Math.ceil(options.screenWidth * 0.48),
      solveFarWidth(nearWidth, targetWidthAtText, options.textDistance, options.maskLength),
    ),
  };
}
