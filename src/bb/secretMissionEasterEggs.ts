import type { BigEyeIntent } from './confessionalBigEye';

export interface SecretMissionEasterEggDefinition {
  id: string;
  intent: BigEyeIntent;
  label: string;
  category: 'special_phrase' | 'game_prompt' | 'relationship';
}

export const SECRET_MISSION_EASTER_EGGS: readonly SecretMissionEasterEggDefinition[] = [
  {
    id: 'big-eye-realness',
    intent: 'realness',
    label: 'Ask the Big Eye whether it is real',
    category: 'special_phrase',
  },
  {
    id: 'big-eye-winner-prediction',
    intent: 'winner_prediction',
    label: 'Ask the Big Eye who will win',
    category: 'special_phrase',
  },
  {
    id: 'big-eye-help-request',
    intent: 'help_request',
    label: 'Ask the Big Eye for help',
    category: 'special_phrase',
  },
  {
    id: 'big-eye-love-confession',
    intent: 'love_confession',
    label: 'Tell the Big Eye “I love you”',
    category: 'relationship',
  },
  {
    id: 'big-eye-game-request',
    intent: 'game_request',
    label: 'Ask the Big Eye to play a game',
    category: 'game_prompt',
  },
] as const;

export function getSecretMissionEasterEggByIntent(intent: BigEyeIntent): SecretMissionEasterEggDefinition | null {
  return SECRET_MISSION_EASTER_EGGS.find((egg) => egg.intent === intent) ?? null;
}
