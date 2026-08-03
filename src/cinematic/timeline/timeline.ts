import { CINEMATIC_CONFIG } from '../config/cinematicConfig';
import { clamp01, easedRange, lerp, pulse, rangeProgress, smoothstep } from '../utils/math';

export type TimelineState = {
  frame: number;
  progress: number;
  dawnProgress: number;
  sunMorph: number;
  sunRevealProgress: number;
  sunPositionProgress: number;
  sunHorizonProgress: number;
  goldenHourProgress: number;
  sunsetProgress: number;
  apertureClosure: number;
  cityExitProgress: number;
  coastProgress: number;
  stormProgress: number;
  eveningProgress: number;
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  starsOpacity: number;
  cloudOpacity: number;
  cloudDarkness: number;
  rainIntensity: number;
  wetness: number;
  ambientIntensity: number;
  sunIntensity: number;
  sunWarmth: number;
  moonIntensity: number;
  moonProgress: number;
  windowIntensity: number;
  streetLightIntensity: number;
  vehicleLightIntensity: number;
  lightning: number;
  lightningBolt: number;
  eyeOpacity: number;
  creditsOpacity: number;
  fadeToDark: number;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  const numeric = Number.parseInt(normalized, 16);
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];
};

const mixColor = (from: string, to: string, amount: number): string => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = clamp01(amount);
  const channels = a.map((channel, index) => Math.round(lerp(channel, b[index] ?? channel, t)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

export const getTimelineState = (inputFrame: number): TimelineState => {
  const outputFrame = Math.min(CINEMATIC_CONFIG.durationInFrames - 1, Math.max(0, inputFrame));
  const progress = outputFrame / (CINEMATIC_CONFIG.durationInFrames - 1);
  // Preserve the authored 60-second narrative timing while presenting it in a
  // tighter 54-second cut.
  const frame = progress * 1799;

  // Story beats: luminous night -> storm -> clearing -> moon/Eye tableau ->
  // camera-aperture transformation -> coastal dawn.
  const apertureClose = easedRange(frame, 1268, 1332);
  const apertureOpen = easedRange(frame, 1438, 1512);
  const apertureClosure = Math.min(apertureClose, 1 - apertureOpen);
  // The celestial texture changes only while the aperture is fully closed.
  const sunMorph = easedRange(frame, 1344, 1374);
  // Keep both the sun and its building reflections dark until the shutter is
  // visibly opening; the sunrise illumination then follows the reveal.
  const sunRevealProgress = easedRange(frame, 1480, 1542);
  const sunPositionProgress = easedRange(frame, 1438, 1545);
  // Complete the eye-to-horizon relocation as part of the same reveal. The
  // yacht camera inspection begins later, so the sun is already anchored to
  // the real horizon instead of correcting its position during the zoom.
  const sunHorizonProgress = sunPositionProgress;
  // Establish a restrained pre-dawn before the shutter opens, then let full
  // daylight arrive with the revealed sun and coastline.
  const preDawn = easedRange(frame, 1328, 1438);
  const fullDaylight = easedRange(frame, 1438, 1650);
  const dawnProgress = clamp01(preDawn * 0.42 + fullDaylight * 0.58);
  // Drop the city below camera before the opaque coast settles in. Keeping
  // these beats adjacent avoids the transparent city/sea double exposure.
  const coastProgress = easedRange(frame, 1498, 1640);
  const cityExitProgress = easedRange(frame, 1518, 1638);
  const goldenHourProgress = easedRange(frame, 1535, 1688);
  // Give the wide landscape a few seconds to move through afternoon, sunset,
  // and evening before the final blackout.
  const sunsetProgress = easedRange(frame, 1684, 1786);
  // The player ends just before the authored final frame. Reach full black
  // early and hold it so the last visible frame cannot leave a grey flash.
  const finalDarkness = easedRange(frame, 1748, 1776);
  const stormProgress = rangeProgress(frame, 300, 930);
  const eveningProgress = rangeProgress(frame, 810, 1320);
  const cloudBuild = easedRange(frame, 300, 465);
  const stormClear = easedRange(frame, 780, 930);
  const stormShade = cloudBuild * (1 - stormClear);
  const rainBuild = easedRange(frame, 360, 495);
  const rainRelease = 1 - easedRange(frame, 720, 840);
  const rainIntensity = Math.min(rainBuild, rainRelease);
  const wetness = smoothstep(rangeProgress(frame, 405, 930));
  const moonReveal = easedRange(frame, 810, 945);
  const nightLightFade = 1 - easedRange(frame, 1325, 1480);

  let skyTop = mixColor('#020617', '#0d1423', stormShade * 0.88);
  let skyHorizon = mixColor('#091936', '#293441', stormShade * 0.82);
  skyTop = mixColor(skyTop, '#7ba9c5', dawnProgress);
  skyHorizon = mixColor(skyHorizon, '#e9c0a3', dawnProgress);
  skyTop = mixColor(skyTop, '#647d9a', goldenHourProgress * 0.48);
  skyHorizon = mixColor(skyHorizon, '#ef9b67', goldenHourProgress * 0.72);
  skyTop = mixColor(skyTop, '#0b1024', sunsetProgress * 0.96);
  skyHorizon = mixColor(skyHorizon, '#5a2635', sunsetProgress * 0.9);

  const strikeOne = pulse(frame, 435, 8);
  const strikeTwo = pulse(frame, 570, 10);
  const strikeThree = pulse(frame, 705, 8);
  const strikeFour = pulse(frame, 780, 6);
  const lightningBolt = Math.min(1, strikeOne + strikeTwo * 0.78 + strikeThree + strikeFour * 0.72);
  const thunderAfterglow =
    pulse(frame, 447, 26) * 0.2
    + pulse(frame, 584, 30) * 0.18
    + pulse(frame, 717, 24) * 0.22;
  const lightning = Math.min(1, lightningBolt * 0.9 + thunderAfterglow);

  return {
    frame,
    progress,
    dawnProgress,
    sunMorph,
    sunRevealProgress,
    sunPositionProgress,
    sunHorizonProgress,
    goldenHourProgress,
    sunsetProgress,
    apertureClosure,
    cityExitProgress,
    coastProgress,
    stormProgress,
    eveningProgress,
    skyTop,
    skyHorizon,
    fogColor: mixColor(
      mixColor(mixColor('#17263d', '#465567', stormShade), '#9fb6be', dawnProgress),
      '#73505a',
      sunsetProgress * 0.72,
    ),
    fogNear: lerp(155, 125, stormShade),
    fogFar: lerp(720, 590, stormShade) + dawnProgress * 74,
    starsOpacity: 0.96 * (1 - stormShade * 0.96) * (1 - easedRange(frame, 1318, 1470)),
    cloudOpacity: (0.08 + stormShade * 0.7) * (1 - dawnProgress * 0.64),
    cloudDarkness: stormShade,
    rainIntensity,
    wetness,
    ambientIntensity: (0.34 - stormShade * 0.08 + lightning * 0.72 + dawnProgress * 0.7)
      * (1 - sunsetProgress * 0.66),
    sunIntensity: sunMorph
      * sunRevealProgress
      * (0.42 + dawnProgress * 0.95)
      * (1 - sunsetProgress * 0.38),
    sunWarmth: clamp01(0.48 + (1 - dawnProgress) * 0.44 + sunsetProgress * 0.46),
    moonIntensity: moonReveal * (1 - sunMorph) * 1.28,
    moonProgress: easedRange(frame, 810, 960),
    windowIntensity: nightLightFade * (2.12 + stormShade * 0.66),
    streetLightIntensity: nightLightFade * (2.22 + stormShade * 0.72),
    vehicleLightIntensity: nightLightFade * (1.9 + stormShade * 0.82),
    lightning,
    lightningBolt,
    eyeOpacity: easedRange(frame, 990, 1140) * (1 - easedRange(frame, 1578, 1622)),
    creditsOpacity: 1 - easedRange(frame, 1588, 1635),
    fadeToDark: finalDarkness,
  };
};
