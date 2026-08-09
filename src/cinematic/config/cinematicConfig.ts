const CINEMATIC_FPS = 30;
const CINEMATIC_DURATION_SECONDS = 54;

export const CINEMATIC_CONFIG = {
  compositionId: 'BigEyeCinematic',
  width: 1080,
  height: 1920,
  fps: CINEMATIC_FPS,
  durationInFrames: CINEMATIC_DURATION_SECONDS * CINEMATIC_FPS,
  seed: 40819,
  timeline: {
    dawn: { from: 1188, to: 1619 },
    storm: { from: 270, to: 837 },
    evening: { from: 729, to: 1188 },
    credits: { from: 0, to: 1619 },
    eye: { from: 891, to: 1539 },
    fadeOut: { from: 1619, to: 1619 },
  },
  palette: {
    midnight: '#030615',
    navy: '#07152f',
    indigo: '#17265d',
    violet: '#6c4ca8',
    cyan: '#5de7ff',
    ice: '#dff8ff',
    sunset: '#f3a16f',
    warmWindow: '#ffd49a',
    asphalt: '#060a12',
    metal: '#10192d',
  },
  city: {
    roadWidth: 18,
    sidewalkWidth: 4,
    nearZ: 165,
    farZ: -455,
    blockStep: 27,
  },
  camera: {
    fov: 52,
    near: 0.1,
    far: 1200,
    positionPoints: [
      [0, 156, 235],
      [24, 122, 152],
      [16, 78, 86],
      [8, 34, 34],
      [-4, 18, -28],
      [4, 12, -96],
      [-3, 10, -166],
      [8, 24, -225],
      [16, 50, -270],
      [8, 60, -326],
      [0, 70, -392],
    ] as const,
    lookAtPoints: [
      [0, 58, 86],
      [0, 43, 50],
      [0, 29, 9],
      [0, 18, -42],
      [0, 11, -103],
      [0, 10, -170],
      [0, 17, -228],
      [0, 32, -300],
      [0, 45, -350],
      [0, 43, -500],
      [0, 30, -650],
    ] as const,
  },
} as const;

export type CreditTextStyle =
  | 'title'
  | 'label'
  | 'name'
  | 'music-title'
  | 'body'
  | 'italic'
  | 'small'
  | 'legal'
  | 'closing-title'
  | 'closing-subtitle';

export type CreditLine = {
  text: string;
  style: CreditTextStyle;
  gapBefore?: boolean;
};

export type CreditCard = {
  id: string;
  fromSecond: number;
  toSecond: number;
  lines: readonly CreditLine[];
};

// Edit this data to change credit copy or timing. The 15–19 second gap is
// intentional and leaves the city unobstructed before Special Thanks.
export const CINEMATIC_CREDITS: readonly CreditCard[] = [
  {
    id: 'thank-you',
    fromSecond: 0,
    toSecond: 3.15,
    lines: [{ text: 'THANK YOU FOR PLAYING', style: 'title' }],
  },
  {
    id: 'created-by',
    fromSecond: 3.15,
    toSecond: 6.3,
    lines: [
      { text: 'Created by', style: 'label' },
      { text: 'Georgi Cole', style: 'name', gapBefore: true },
    ],
  },
  {
    id: 'art-direction',
    fromSecond: 6.3,
    toSecond: 9.45,
    lines: [
      { text: 'Art Direction', style: 'label' },
      { text: 'I.C.O. LTD', style: 'name', gapBefore: true },
    ],
  },
  {
    id: 'game-design',
    fromSecond: 9.45,
    toSecond: 12.6,
    lines: [
      { text: 'Game Design', style: 'label' },
      { text: 'Georgi Cole', style: 'name', gapBefore: true },
    ],
  },
  {
    id: 'music-title',
    fromSecond: 12.6,
    toSecond: 17.1,
    lines: [
      { text: 'Main theme', style: 'label' },
      { text: '“Move Into Me”', style: 'music-title', gapBefore: true },
      { text: 'The Red Collective · Indigoe · JQ', style: 'body' },
    ],
  },
  {
    id: 'album',
    fromSecond: 17.1,
    toSecond: 21.3,
    lines: [
      { text: 'From the album', style: 'small' },
      { text: 'Crushed Velvet', style: 'italic', gapBefore: true },
      { text: 'Audiosocket Records', style: 'small', gapBefore: true },
    ],
  },
  {
    id: 'music-producers',
    fromSecond: 22.5,
    toSecond: 27.8,
    lines: [
      { text: 'Music producers', style: 'label' },
      { text: 'Joshua Ryan Collopy', style: 'name', gapBefore: true },
      { text: 'James Andrew Quick', style: 'name' },
    ],
  },
  {
    id: 'thanks-jaysomeday',
    fromSecond: 28.8,
    toSecond: 31.5,
    lines: [
      { text: 'Housemates theme by:', style: 'label' },
      { text: 'Jay Someday - Midnight', style: 'name', gapBefore: true },
    ],
  },
  {
    id: 'thanks-newnote',
    fromSecond: 31.5,
    toSecond: 34.2,
    lines: [
      { text: 'Special Thanks', style: 'label' },
      { text: 'New Note Music', style: 'name', gapBefore: true },
    ],
  },
  {
    id: 'thanks-mina',
    fromSecond: 34.2,
    toSecond: 36.9,
    lines: [
      { text: 'Special Thanks', style: 'label' },
      { text: 'Dr. Mina T.K.', style: 'name', gapBefore: true },
    ],
  },
    {
    id: 'disclaimer',
    fromSecond: 39.6,
    toSecond: 45.2,
    lines: [
      { text: 'Any resemblance to actual persons or events is purely coincidental.', style: 'legal' },
    ],
  },
  {
    id: 'closing',
    fromSecond: 45.8,
    toSecond: 49.9,
    lines: [
      { text: 'THE BIG EYE IS STILL SCANNING...', style: 'closing-title' },
      { text: 'More is coming soon', style: 'closing-subtitle', gapBefore: true },
    ],
  },
] as const;

export const CINEMATIC_AUDIO = {
  source: 'assets/sounds/move_into_me_alternative.mp3',
  sourceStartInSeconds: 46,
  fadeInSeconds: 1.2,
  fadeOutSeconds: 1.8,
  volume: 0.75,
} as const;

export const OPTIONAL_ASSETS = {
  eye: 'assets/big-eye.png',
  distantSkyline: 'assets/distant-skyline.png',
  clouds1: 'assets/clouds-1.png',
  clouds2: 'assets/clouds-2.png',
  moon: 'assets/moon.png',
  stars: 'assets/stars.png',
} as const;
