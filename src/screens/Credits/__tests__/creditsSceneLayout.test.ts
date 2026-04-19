import { describe, expect, it } from 'vitest';
import {
  getBeamWidthAtDistance,
  getCreditTextPlacement,
  getMoonExclusionZone,
  getTextRevealMaskDimensions,
  getVisibleBeamDimensions,
  textBlockIntersectsMoonZone,
} from '../creditsSceneLayout';

const BEAM_ANGLE = -2;

describe('creditsSceneLayout', () => {
  it('keeps the projected text in the mid-beam area and on-screen on mobile portrait', () => {
    const placement = getCreditTextPlacement({
      screenWidth: 390,
      screenHeight: 844,
      designScale: 1,
      beamOriginX: 390 * 0.78,
      beamOriginY: 632,
      beamAngle: BEAM_ANGLE,
      beamLength: 658,
    });

    expect(placement.textY).toBeGreaterThanOrEqual(460);
    expect(placement.textY).toBeLessThan(632);
    expect(placement.maxTextWidth).toBeGreaterThanOrEqual(180);
    expect(placement.maxTextWidth).toBeLessThanOrEqual(208);
    expect(placement.textX - placement.maxTextWidth / 2).toBeGreaterThanOrEqual(16);
    expect(placement.textX + placement.maxTextWidth / 2).toBeLessThanOrEqual(390 - 16);
  });

  it('keeps the visible beam elegant while letting the invisible text mask be wider', () => {
    const visibleBeam = getVisibleBeamDimensions(390);
    const textRevealMask = getTextRevealMaskDimensions({
      screenWidth: 390,
      textWidth: 196,
      textHeight: 84,
      textDistance: 188,
      maskLength: 304,
      beamPadding: 48,
    });
    const visibleWidthAtText = getBeamWidthAtDistance(
      visibleBeam.outerNearWidth,
      visibleBeam.outerFarWidth,
      188,
      304,
    );
    const maskWidthAtText = getBeamWidthAtDistance(
      textRevealMask.nearWidth,
      textRevealMask.farWidth,
      188,
      304,
    );

    expect(visibleBeam.outerFarWidth).toBeLessThanOrEqual(Math.round(390 * 0.35));
    expect(visibleBeam.outerFarWidth).toBeGreaterThan(visibleBeam.innerFarWidth);
    expect(maskWidthAtText).toBeGreaterThanOrEqual(196 + 40);
    expect(maskWidthAtText).toBeGreaterThan(visibleWidthAtText);
  });

  it('widens only the reveal mask when a longer credit line is measured', () => {
    const visibleBeam = getVisibleBeamDimensions(390);
    const expectedVisibleOuterFarWidth = Math.round(390 * 0.3);
    const shortMask = getTextRevealMaskDimensions({
      screenWidth: 390,
      textWidth: 150,
      textHeight: 44,
      textDistance: 182,
      maskLength: 280,
      beamPadding: 44,
    });
    const longMask = getTextRevealMaskDimensions({
      screenWidth: 390,
      textWidth: 210,
      textHeight: 84,
      textDistance: 182,
      maskLength: 302,
      beamPadding: 52,
    });

    expect(visibleBeam.outerFarWidth).toBe(expectedVisibleOuterFarWidth);
    expect(longMask.farWidth).toBeGreaterThan(shortMask.farWidth);
  });

  it('detects when text would overlap the moon exclusion zone', () => {
    const moonZone = getMoonExclusionZone(390, 844);

    expect(moonZone.x).toBeGreaterThanOrEqual(90);
    expect(moonZone.x).toBeLessThanOrEqual(100);
    expect(moonZone.y).toBeGreaterThanOrEqual(450);
    expect(textBlockIntersectsMoonZone(moonZone.x, moonZone.y, 140, 80, moonZone)).toBe(true);
    expect(textBlockIntersectsMoonZone(232, 474, 160, 84, moonZone)).toBe(false);
  });
});
