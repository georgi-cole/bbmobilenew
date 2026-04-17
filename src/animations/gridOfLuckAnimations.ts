import type { Transition, Variants } from 'framer-motion';

const cinematicEase: Transition['ease'] = 'easeInOut';

export const boxVariants: Variants = {
  idle: {
    scale: [1, 1.018, 1],
    boxShadow: [
      '0 0 0 rgba(0,0,0,0)',
      '0 0 22px rgba(76, 211, 255, 0.14)',
      '0 0 8px rgba(76, 211, 255, 0.06)',
    ],
    filter: [
      'brightness(0.94) saturate(1)',
      'brightness(1.04) saturate(1.08)',
      'brightness(0.96) saturate(1)',
    ],
    transition: {
      duration: 2.8,
      repeat: Infinity,
      repeatType: 'mirror',
      ease: cinematicEase,
    },
  },
  hover: {
    scale: 1.04,
    y: -6,
    boxShadow: '0 0 32px rgba(200, 160, 255, 0.35), 0 14px 36px rgba(0,0,0,0.55)',
    transition: { type: 'spring', stiffness: 260, damping: 16, mass: 0.65 },
  },
  press: {
    scale: 0.96,
    y: 2,
    boxShadow: '0 0 8px rgba(185, 140, 255, 0.18)',
    transition: { type: 'spring', stiffness: 440, damping: 24, mass: 0.5 },
  },
  locked: {
    opacity: 0.34,
    scale: 0.985,
    filter: 'saturate(0.45) brightness(0.6)',
    boxShadow: '0 0 8px rgba(255,255,255,0.03)',
    transition: { duration: 0.5, ease: cinematicEase },
  },
  opened: {
    opacity: 0.74,
    scale: 1,
    filter: 'saturate(0.82) brightness(0.86)',
    boxShadow: '0 0 14px rgba(255,255,255,0.06)',
    transition: { duration: 0.45, ease: cinematicEase },
  },
};

export const boxOpenSequence: Variants = {
  preOpen: {
    scale: [1, 1.018, 0.986, 1.03],
    rotate: [0, -0.8, 0.8, 0],
    boxShadow: [
      '0 0 10px rgba(255,255,255,0.04)',
      '0 0 26px rgba(255,255,255,0.14)',
      '0 0 44px rgba(255,255,255,0.24)',
    ],
    transition: { duration: 0.46, ease: cinematicEase },
  },
  crack: {
    scale: [1.03, 1.11, 0.92, 1.02],
    rotate: [0, 2.8, -2.1, 0],
    boxShadow: [
      '0 0 22px rgba(255,255,255,0.16)',
      '0 0 58px rgba(255,255,255,0.5)',
      '0 0 18px rgba(255,255,255,0.12)',
    ],
    transition: { duration: 0.42, ease: cinematicEase, times: [0, 0.35, 0.72, 1] },
  },
  reveal: {
    y: [10, -8, -36],
    opacity: [0, 0.68, 1],
    scale: [0.74, 1.06, 1],
    filter: [
      'blur(7px) brightness(1.5)',
      'blur(2px) brightness(1.2)',
      'blur(0px) brightness(1)',
    ],
    transition: { duration: 0.72, ease: cinematicEase, times: [0, 0.45, 1] },
  },
  settle: {
    y: 0,
    scale: 1,
    opacity: 1,
    filter: 'blur(0px) brightness(1)',
    transition: { duration: 0.42, ease: cinematicEase },
  },
};

export const playerVariants: Variants = {
  activePlayer: {
    scale: [1, 1.03, 1],
    boxShadow: [
      '0 0 0 rgba(255,238,170,0)',
      '0 0 26px rgba(255,226,134,0.36)',
      '0 0 12px rgba(255,226,134,0.18)',
    ],
    transition: {
      duration: 1.9,
      repeat: Infinity,
      repeatType: 'mirror',
      ease: cinematicEase,
    },
  },
  targetedPlayer: {
    scale: [1, 1.025, 1],
    boxShadow: [
      '0 0 0 rgba(255,74,74,0)',
      '0 0 28px rgba(255,74,74,0.44)',
      '0 0 8px rgba(255,74,74,0.16)',
    ],
    transition: {
      duration: 1.2,
      repeat: Infinity,
      repeatType: 'mirror',
      ease: cinematicEase,
    },
  },
  eliminatedPlayer: {
    opacity: [0.52, 0.4, 0.48, 0.38],
    scale: 0.96,
    filter: [
      'grayscale(0.8) brightness(0.7)',
      'grayscale(1) brightness(0.55)',
      'grayscale(0.96) brightness(0.62)',
      'grayscale(1) brightness(0.52)',
    ],
    transition: {
      duration: 1.8,
      repeat: Infinity,
      repeatType: 'loop',
      ease: cinematicEase,
      times: [0, 0.28, 0.54, 1],
    },
  },
};

export const lpFloatVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.72,
    y: 0,
    filter: 'blur(6px)',
  },
  animate: {
    opacity: [0, 1, 0.96, 0],
    scale: [0.72, 1.02, 1, 0.92],
    y: [0, -12, -40, -58],
    filter: ['blur(6px)', 'blur(0px)', 'blur(0px)', 'blur(2px)'],
    transition: {
      duration: 1.24,
      ease: cinematicEase,
      times: [0, 0.18, 0.72, 1],
    },
  },
};

export const screenEffects: Variants = {
  idle: {
    opacity: 0,
    scale: 1,
    background:
      'radial-gradient(circle at center, rgba(4,11,24,0) 34%, rgba(2,5,14,0) 100%)',
    transition: { duration: 0.3, ease: cinematicEase },
  },
  vignette: {
    opacity: 1,
    scale: 1,
    background:
      'radial-gradient(circle at center, rgba(4,11,24,0) 28%, rgba(2,5,14,0.76) 100%)',
    transition: { duration: 0.5, ease: cinematicEase },
  },
  zoomIn: {
    scale: 1.024,
    opacity: 1,
    transition: { duration: 0.58, ease: cinematicEase },
  },
  flash: {
    opacity: [0, 0.78, 0],
    scale: [1, 1.01, 1],
    background:
      'radial-gradient(circle at center, rgba(255,255,255,0.56) 0%, rgba(255,255,255,0) 68%)',
    transition: { duration: 0.42, ease: cinematicEase, times: [0, 0.24, 1] },
  },
};
