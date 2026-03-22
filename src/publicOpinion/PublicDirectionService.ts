import type { Player } from '../types';
import { mulberry32, seededPick, seededPickN } from '../store/rng';
import { publicOpinionConfig } from './publicOpinionConfig';
import type { PublicDirection, DirectionType } from './types';

const DIRECTION_TYPES: DirectionType[] = [
  'get_closer',
  'target_player',
  'protect_player',
  'win_competition',
  'make_bold_move',
  'apologize',
  'expose_player',
  'align_with',
  'confront_player',
  'show_loyalty',
  'start_drama',
  'win_veto',
];

const SOLO_DIRECTION_TYPES: DirectionType[] = ['win_competition', 'make_bold_move', 'win_veto'];

function buildDescription(
  type: DirectionType,
  playerName: string,
  relatedName?: string,
): string {
  switch (type) {
    case 'get_closer':
      return `Get closer to ${relatedName ?? 'a housemate'}`;
    case 'target_player':
      return `Target ${relatedName ?? 'a rival'} for eviction`;
    case 'protect_player':
      return `Protect ${relatedName ?? 'an ally'} from eviction`;
    case 'win_competition':
      return `${playerName}, win the next competition!`;
    case 'make_bold_move':
      return `${playerName}, make a bold move this week!`;
    case 'apologize':
      return `Apologize to ${relatedName ?? 'someone'}`;
    case 'expose_player':
      return `Expose ${relatedName ?? 'a rival'}'s game`;
    case 'align_with':
      return `Form an alliance with ${relatedName ?? 'someone'}`;
    case 'confront_player':
      return `Confront ${relatedName ?? 'a rival'} publicly`;
    case 'show_loyalty':
      return `Show loyalty to ${relatedName ?? 'your allies'}`;
    case 'start_drama':
      return `Start drama with ${relatedName ?? 'a housemate'}`;
    case 'win_veto':
      return `${playerName}, win the Power of Veto!`;
    default:
      return `Complete a public challenge`;
  }
}

export function generateDirectionsForCycle(params: {
  players: Player[];
  week: number;
  seed: number;
  count?: number;
}): PublicDirection[] {
  const { players, week, seed, count = publicOpinionConfig.directionsPerCycle } = params;

  const activePlayers = players.filter(
    (p) => p.status !== 'evicted' && p.status !== 'jury',
  );

  if (activePlayers.length === 0) return [];

  const rng = mulberry32(((seed ^ (week * 0x9e3779b9)) >>> 0));
  const directions: PublicDirection[] = [];

  const selectedPlayers = seededPickN(rng, activePlayers, Math.min(count, activePlayers.length));

  for (const player of selectedPlayers) {
    const dirType: DirectionType = seededPick(rng, DIRECTION_TYPES);
    const isSolo = SOLO_DIRECTION_TYPES.includes(dirType);

    let relatedPlayerId: string | undefined;
    let relatedName: string | undefined;

    if (!isSolo && activePlayers.length > 1) {
      const others = activePlayers.filter((p) => p.id !== player.id);
      const related = seededPick(rng, others);
      relatedPlayerId = related.id;
      relatedName = related.name;
    }

    const approvalDelta = publicOpinionConfig.directionRewards.success;

    const direction: PublicDirection = {
      id: `dir-${week}-${player.id}-${dirType}-${Math.floor(rng() * 10000)}`,
      type: dirType,
      playerId: player.id,
      relatedPlayerId,
      description: buildDescription(dirType, player.name, relatedName),
      status: 'active',
      createdWeek: week,
      expiresAtWeek: week + 2,
      approvalDelta,
    };

    directions.push(direction);
  }

  return directions;
}
