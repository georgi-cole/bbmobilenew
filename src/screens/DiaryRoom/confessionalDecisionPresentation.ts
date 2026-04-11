import { calculateRequiredDoubleEvictionSlots } from '../../features/twists/doubleEvictionTieUtils';
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors';
import type { GameState, Player } from '../../types';

export interface DecisionPresentation {
  key: string;
  prompt: string;
}

export function getConfessionalPowerName(game: GameState): string {
  const activeSpecialVeto = game.specialVeto?.activeType ?? null;
  if (activeSpecialVeto === 'vip') return 'Double Trouble';
  if (activeSpecialVeto === 'diamond') return 'Halo Exchange';
  if (activeSpecialVeto === 'coup') return 'Detox';
  if (activeSpecialVeto === 'spotlight') return 'Force Majeure';
  return 'Power of Safety';
}

export function getConfessionalDecisionPresentation(
  decision: ActiveConfessionalDecision,
  game: GameState,
  alivePlayers: Player[],
): DecisionPresentation {
  const tiedIds = game.tiedNomineeIds ?? game.nomineeIds;
  const powerName = getConfessionalPowerName(game);

  let prompt = 'The Big Eye is waiting for your decision.';

  switch (decision.type) {
    case 'nominations': {
      const required = game.doubleEviction?.weekActive ? 3 : 2;
      prompt = required === 3
        ? 'Choose the three houseguests you want to nominate for the Double Elimination.'
        : 'Choose the two houseguests you want to nominate.';
      break;
    }
    case 'eviction_vote':
      prompt = 'Choose who you want to eliminate.';
      break;
    case 'double_vote_offer':
      prompt = 'You have a stored Double Vote. Do you want to use it now?';
      break;
    case 'double_vote':
      prompt = 'Choose your two eviction votes. You may vote for the same nominee twice.';
      break;
    case 'pos_decision':
      prompt = `Do you want to use ${powerName}?`;
      break;
    case 'vip_second_use':
      prompt = 'Do you want to use Double Trouble a second time?';
      break;
    case 'pos_save_target':
      prompt = game.specialVeto?.awaitingVipSecondSaveTarget
        ? 'Choose the second nominee you want to save.'
        : 'Choose which nominee you want to save.';
      break;
    case 'replacement_nominee':
      prompt = game.specialVeto?.awaitingCoupReplacement1
        ? 'Choose the first replacement nominee.'
        : game.specialVeto?.awaitingCoupReplacement2
          ? 'Choose the second replacement nominee.'
          : 'Choose the replacement nominee.';
      break;
    case 'tie_break': {
      const multiSelectCount = game.doubleEviction?.weekActive
        ? calculateRequiredDoubleEvictionSlots(
          tiedIds.length,
          Boolean(game.pendingEviction),
        )
        : 1;
      prompt = multiSelectCount > 1
        ? `Choose the ${multiSelectCount} houseguests you want to eliminate.`
        : 'Break the tie by choosing who you want to eliminate.';
      break;
    }
    default:
      break;
  }

  const availableNames = new Set(alivePlayers.map((player) => player.name));
  const key = `${decision.type}:${decision.week}:${decision.phase}:${prompt}:${availableNames.size}`;
  return { key, prompt };
}
