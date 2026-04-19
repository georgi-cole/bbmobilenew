const MIN_SCREEN_MARGIN = 16;
const MAX_SCREEN_MARGIN = 24;
const MIN_TEXT_WIDTH = 170;
const MIN_TEXT_HALF_WIDTH = MIN_TEXT_WIDTH * 0.5;
const MIN_BEAM_PADDING = 40;
const MAX_BEAM_PADDING = 60;
// Clamp the interpolation ratio so the trapezoid math stays stable even if the
// text sits very close to the projector source or near the far edge of the beam.
const MIN_BEAM_TEXT_RATIO = 0.18;
const MAX_BEAM_TEXT_RATIO = 0.95;

export type CreditTextPlacement = {
  textX: number;
  textY: number;
  textDistance: number;
  maxTextWidth: number;
  baseFontSize: number;
  lineHeight: number;
  beamPadding: number;
};

export type CreditBeamDimensions = {
  outerNearWidth: number;
  outerFarWidth: number;
  innerNearWidth: number;
  innerFarWidth: number;
  maskNearWidth: number;
  maskFarWidth: number;
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
  const distanceRatio = clamp(textDistance / beamLength, MIN_BEAM_TEXT_RATIO, MAX_BEAM_TEXT_RATIO);
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
  const targetTextY = Math.max(options.screenHeight * 0.46, 308);
  const minTextDistance = Math.max(options.screenHeight * 0.28, 210);
  const maxTextDistance = options.beamLength * 0.72;
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
    maxTextWidth: Math.floor(Math.min(options.screenWidth - screenMargin * 2, availableHalfWidth * 2)),
    baseFontSize: Math.max(20, Math.round(24 * options.designScale)),
    lineHeight: Math.max(30, Math.round(38 * options.designScale)),
    beamPadding: Math.round(clamp(options.screenWidth * 0.14, MIN_BEAM_PADDING, MAX_BEAM_PADDING)),
  };
}

export function getCreditBeamDimensions(options: {
  screenWidth: number;
  textWidth: number;
  textHeight: number;
  textDistance: number;
  beamLength: number;
  beamPadding: number;
}): CreditBeamDimensions {
  const outerNearWidth = 12;
  const innerNearWidth = 8;
  const maskNearWidth = 16;
  const diagonalAllowance = Math.max(12, Math.min(26, options.textHeight * 0.35));
  const outerTargetWidth = options.textWidth + options.beamPadding + diagonalAllowance;
  const innerTargetWidth = options.textWidth + options.beamPadding * 0.66 + diagonalAllowance;
  const maskTargetWidth = options.textWidth + options.beamPadding + Math.max(24, options.textHeight * 0.45);

  return {
    outerNearWidth,
    outerFarWidth: Math.max(
      Math.ceil(options.screenWidth * 0.64),
      solveFarWidth(outerNearWidth, outerTargetWidth, options.textDistance, options.beamLength),
    ),
    innerNearWidth,
    innerFarWidth: Math.max(
      Math.ceil(options.screenWidth * 0.42),
      solveFarWidth(innerNearWidth, innerTargetWidth, options.textDistance, options.beamLength),
    ),
    maskNearWidth,
    maskFarWidth: Math.max(
      Math.ceil(options.screenWidth * 0.74),
      solveFarWidth(maskNearWidth, maskTargetWidth, options.textDistance, options.beamLength),
    ),
  };
}
