import { describe, expect, it } from 'vitest';
import {
  getBeamWidthAtDistance,
  getCreditBeamDimensions,
  getCreditTextPlacement,
} from '../creditsSceneLayout';

const BEAM_ANGLE = -2.18;

describe('creditsSceneLayout', () => {
  it('keeps the projected text centered on the beam while staying on-screen on mobile portrait', () => {
    const placement = getCreditTextPlacement({
      screenWidth: 390,
      screenHeight: 844,
      designScale: 1,
      beamOriginX: 390 * 0.78,
      beamOriginY: 632,
      beamAngle: BEAM_ANGLE,
      beamLength: 658,
    });

    expect(placement.textY).toBeLessThan(632);
    expect(placement.maxTextWidth).toBeGreaterThanOrEqual(170);
    expect(placement.textX - placement.maxTextWidth / 2).toBeGreaterThanOrEqual(16);
    expect(placement.textX + placement.maxTextWidth / 2).toBeLessThanOrEqual(390 - 16);
    expect(placement.beamPadding).toBeGreaterThanOrEqual(40);
    expect(placement.beamPadding).toBeLessThanOrEqual(60);
  });

  it('widens the beam enough to fully cover the measured credit text with a softer reveal mask', () => {
    const placement = getCreditTextPlacement({
      screenWidth: 390,
      screenHeight: 844,
      designScale: 1,
      beamOriginX: 390 * 0.78,
      beamOriginY: 632,
      beamAngle: BEAM_ANGLE,
      beamLength: 658,
    });
    const dimensions = getCreditBeamDimensions({
      screenWidth: 390,
      textWidth: 228,
      textHeight: 84,
      textDistance: placement.textDistance,
      beamLength: 658,
      beamPadding: placement.beamPadding,
    });

    const innerWidthAtText = getBeamWidthAtDistance(
      dimensions.innerNearWidth,
      dimensions.innerFarWidth,
      placement.textDistance,
      658,
    );
    const outerWidthAtText = getBeamWidthAtDistance(
      dimensions.outerNearWidth,
      dimensions.outerFarWidth,
      placement.textDistance,
      658,
    );
    const maskWidthAtText = getBeamWidthAtDistance(
      dimensions.maskNearWidth,
      dimensions.maskFarWidth,
      placement.textDistance,
      658,
    );

    expect(innerWidthAtText).toBeGreaterThan(228);
    expect(outerWidthAtText).toBeGreaterThanOrEqual(228 + 40);
    expect(maskWidthAtText).toBeGreaterThan(outerWidthAtText);
    expect(dimensions.maskFarWidth).toBeGreaterThan(dimensions.outerFarWidth);
    expect(dimensions.outerFarWidth).toBeGreaterThan(dimensions.innerFarWidth);
  });

  it('expands the far beam width when a longer credit line is measured', () => {
    const shortTextBeam = getCreditBeamDimensions({
      screenWidth: 390,
      textWidth: 150,
      textHeight: 44,
      textDistance: 280,
      beamLength: 658,
      beamPadding: 48,
    });
    const longTextBeam = getCreditBeamDimensions({
      screenWidth: 390,
      textWidth: 240,
      textHeight: 84,
      textDistance: 280,
      beamLength: 658,
      beamPadding: 56,
    });

    expect(longTextBeam.innerFarWidth).toBeGreaterThan(shortTextBeam.innerFarWidth);
    expect(longTextBeam.outerFarWidth).toBeGreaterThan(shortTextBeam.outerFarWidth);
    expect(longTextBeam.maskFarWidth).toBeGreaterThan(shortTextBeam.maskFarWidth);
  });
});
