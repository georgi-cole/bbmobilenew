import type {
  QuickTapRaceActiveEffect,
  QuickTapRaceEffectDefinition,
  QuickTapRaceEffectId,
  QuickTapRacePickupType,
} from './types';

export const EFFECT_DEFINITIONS: Record<QuickTapRaceEffectId, QuickTapRaceEffectDefinition> = {
  nitro: {
    id: 'nitro',
    label: 'Nitro Surge',
    shortLabel: 'Nitro',
    icon: '⚡',
    polarity: 'positive',
    durationMs: 2_400,
    scoreMultiplier: 1.34,
    comboBonus: 0.4,
    decayFactor: 0.78,
  },
  comboAmp: {
    id: 'comboAmp',
    label: 'Combo Amplifier',
    shortLabel: 'Combo Amp',
    icon: '🔥',
    polarity: 'positive',
    durationMs: 2_900,
    scoreMultiplier: 1.18,
    comboBonus: 0.8,
    decayFactor: 0.7,
  },
  gripLock: {
    id: 'gripLock',
    label: 'Grip Lock Shield',
    shortLabel: 'Shield',
    icon: '🛡️',
    polarity: 'positive',
    durationMs: 2_700,
    scoreMultiplier: 1.08,
    decayFactor: 0.56,
    grantsShield: 1,
  },
  dragField: {
    id: 'dragField',
    label: 'Drag Field',
    shortLabel: 'Drag',
    icon: '🧲',
    polarity: 'negative',
    durationMs: 2_300,
    scoreMultiplier: 0.72,
    decayFactor: 1.45,
  },
  stumble: {
    id: 'stumble',
    label: 'Stumble Burst',
    shortLabel: 'Stumble',
    icon: '💥',
    polarity: 'negative',
    durationMs: 1_650,
    scoreMultiplier: 0.8,
    decayFactor: 1.25,
    instantScoreDelta: [-6, -3],
  },
  scramble: {
    id: 'scramble',
    label: 'Rhythm Scramble',
    shortLabel: 'Scramble',
    icon: '🌀',
    polarity: 'negative',
    durationMs: 2_100,
    scoreMultiplier: 0.9,
    instability: 0.38,
    decayFactor: 1.18,
  },
  flashBoost: {
    id: 'flashBoost',
    label: 'Flash Boost',
    shortLabel: 'Flash',
    icon: '🎁',
    polarity: 'chaotic',
    durationMs: 1_200,
    scoreMultiplier: 1.14,
    comboBonus: 0.45,
    instantScoreDelta: [3, 8],
  },
  gamble: {
    id: 'gamble',
    label: 'Gamble Gift',
    shortLabel: 'Gamble',
    icon: '🎲',
    polarity: 'chaotic',
    durationMs: 1_700,
    scoreMultiplier: 1,
    instability: 0.2,
    instantScoreDelta: [-8, 11],
  },
};

export const BOOSTER_EFFECT_IDS: QuickTapRaceEffectId[] = ['nitro', 'comboAmp', 'gripLock', 'dragField'];
export const GIFT_EFFECT_IDS: QuickTapRaceEffectId[] = ['flashBoost', 'gamble', 'stumble', 'scramble', 'nitro', 'dragField'];

export function createActiveEffect(effectId: QuickTapRaceEffectId): QuickTapRaceActiveEffect {
  const definition = EFFECT_DEFINITIONS[effectId];
  return {
    id: effectId,
    label: definition.label,
    shortLabel: definition.shortLabel,
    icon: definition.icon,
    polarity: definition.polarity,
    remainingMs: definition.durationMs,
    decayFactor: definition.decayFactor ?? 1,
    scoreMultiplier: definition.scoreMultiplier ?? 1,
    comboBonus: definition.comboBonus ?? 0,
    instability: definition.instability ?? 0,
  };
}

export function getPickupVisual(type: QuickTapRacePickupType, effectId: QuickTapRaceEffectId) {
  const effect = EFFECT_DEFINITIONS[effectId];
  if (type === 'gift') {
    return {
      icon: '🎁',
      color: '#facc15',
      label: 'Mystery gift',
    };
  }

  const color =
    effect.polarity === 'positive'
      ? '#4ade80'
      : effect.polarity === 'negative'
        ? '#fb7185'
        : '#60a5fa';

  return {
    icon: effect.icon,
    color,
    label: effect.label,
  };
}
