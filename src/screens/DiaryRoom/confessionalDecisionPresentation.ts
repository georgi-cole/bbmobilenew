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
  const keyParts = [
    decision.type,
    String(decision.week),
    decision.phase,
  ];

  switch (decision.type) {
    case 'nominations': {
      const required = game.doubleEviction?.weekActive ? 3 : 2;
      const alivePlayerIdsCsv = alivePlayers.map((player) => player.id).join(',');
      prompt = required === 3
        ? 'Choose the three players you want to nominate for the Double Elimination.'
        : 'Choose the two players you want to nominate.';
      keyParts.push(
        `required=${required}`,
        `loh=${game.lohId ?? 'none'}`,
        `auto=${game.publicModeEnabled && !game.doubleEviction?.weekActive
          ? (game.lastHohCompFinisherId ?? 'none')
          : 'none'}`,
        `alive=${alivePlayerIdsCsv}`,
      );
      break;
    }
    case 'eviction_vote':
      prompt = 'Choose who you want to eliminate.';
      keyParts.push(`nominees=${game.nomineeIds.join(',')}`);
      break;
    case 'double_vote_offer':
      prompt = 'You have a stored Double Vote. Do you want to use it now?';
      keyParts.push(`offer=${game.week}`);
      break;
    case 'double_vote':
      prompt = 'Choose your two eviction votes. You may vote for the same nominee twice.';
      keyParts.push(`nominees=${game.nomineeIds.join(',')}`);
      break;
    case 'mission_immunity_offer': {
      const duration = game.secretMission?.reward?.durationDays ?? 1;
      prompt = `Do you want to use your ${duration}-day secret immunity now?`;
      keyParts.push(`duration=${duration}`, `nominees=${game.nomineeIds.join(',')}`);
      break;
    }
    case 'pos_decision':
      prompt = `Do you want to use ${powerName}?`;
      keyParts.push(
        `power=${game.specialVeto?.activeType ?? 'standard'}`,
        `winner=${game.posWinnerId ?? 'none'}`,
      );
      break;
    case 'vip_second_use':
      prompt = 'Do you want to use Double Trouble a second time?';
      keyParts.push(
        `power=${game.specialVeto?.activeType ?? 'none'}`,
        `winner=${game.posWinnerId ?? 'none'}`,
      );
      break;
    case 'pos_save_target':
      prompt = game.specialVeto?.awaitingVipSecondSaveTarget
        ? 'Choose the second nominee you want to save.'
        : 'Choose which nominee you want to save.';
      keyParts.push(
        `nominees=${game.nomineeIds.join(',')}`,
        `vipSecond=${game.specialVeto?.awaitingVipSecondSaveTarget ? 'yes' : 'no'}`,
      );
      break;
    case 'replacement_nominee': {
      const alivePlayerIdsCsv = alivePlayers.map((player) => player.id).join(',');
      prompt = game.specialVeto?.awaitingCoupReplacement1
        ? 'Choose the first backup nominee.'
        : game.specialVeto?.awaitingCoupReplacement2
          ? 'Choose the second backup nominee.'
          : 'Choose the backup nominee.';
      keyParts.push(
        `mode=${game.specialVeto?.awaitingCoupReplacement1
          ? 'coup1'
          : game.specialVeto?.awaitingCoupReplacement2
            ? 'coup2'
            : game.specialVeto?.awaitingHolderReplacement
              ? 'holder'
              : 'standard'}`,
        `nominees=${game.nomineeIds.join(',')}`,
        `saved=${game.povSavedId ?? 'none'}`,
        `alive=${alivePlayerIdsCsv}`,
      );
      break;
    }
    case 'tie_break': {
      const multiSelectCount = game.doubleEviction?.weekActive
        ? calculateRequiredDoubleEvictionSlots(
          tiedIds.length,
          Boolean(game.pendingEviction),
        )
        : 1;
      prompt = multiSelectCount > 1
        ? `Choose the ${multiSelectCount} players you want to eliminate.`
        : 'Break the tie by choosing who you want to eliminate.';
      keyParts.push(
        `tied=${tiedIds.join(',')}`,
        `required=${multiSelectCount}`,
      );
      break;
    }
    default:
      break;
  }

  const key = keyParts.join(':');
  return { key, prompt };
}
