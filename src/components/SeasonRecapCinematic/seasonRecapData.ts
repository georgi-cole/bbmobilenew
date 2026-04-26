import type { Player } from '../../types';
import type { PublicOpinionState } from '../../publicOpinion/types';
import {
  resolveAvatarCandidates,
  resolveInformalCutout,
  resolveInformalCutoutCandidates,
  resolveSilhouetteFallback,
} from '../../utils/avatar';

const TABLOID_PHOTO_MODULES = import.meta.glob('../../../public/assets/tabloid_photos/*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

export type AwardCategoryId =
  | 'compzilla'
  | 'head_honcho'
  | 'mess_factory'
  | 'ghost_mode'
  | 'vibe_curator'
  | 'heat_magnet';

export interface RecapBeat {
  id: string;
  title: string;
  support: string;
  visual: 'receipts' | 'alliances' | 'block' | 'finalists';
}

export interface AwardCategory {
  id: AwardCategoryId;
  name: string;
  subtitle: string;
  emoji: string;
  winner: Player;
  winnerStat: string;
  accentColor: string;
  accentGlow: string;
  bgGradient: string;
  visualVariant: AwardCategoryId;
}

export interface TabloidCard {
  id: string;
  headline: string;
  subhead: string;
  imageSources: string[];
  imageAlt: string;
}

export interface EvictionWave {
  id: string;
  players: Player[];
  caption: string;
}

export interface RecapData {
  montageBeats: RecapBeat[];
  montageFragments: string[];
  categories: AwardCategory[];
  tabloidCards: TabloidCard[];
  evictionWaves: EvictionWave[];
  evictionLadder: Player[];
  finalists: Player[];
  tabloidPhotoSources: string[];
}

function firstName(player: Player | null | undefined): string {
  return player?.name.split(' ')[0] ?? 'A housemate';
}

function totalCompWins(player: Player): number {
  return (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0);
}

function nominations(player: Player): number {
  return player.stats?.timesNominated ?? 0;
}

function getPlacementValue(player: Player): number | null {
  if (typeof player.seasonPlacement === 'number') return player.seasonPlacement;
  if (typeof player.finalRank === 'number') return player.finalRank;
  return null;
}

function isFinalistStatus(status: Player['status']): boolean {
  return (
    status === 'active' ||
    status === 'loh' ||
    status === 'pos' ||
    status === 'loh+pos' ||
    status === 'nominated' ||
    status === 'nominated+pos'
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deriveApproval(player: Player, publicOpinion?: PublicOpinionState | null): number {
  const explicit = publicOpinion?.profiles[player.id]?.approval;
  if (typeof explicit === 'number') return explicit;
  const derived = 58 + totalCompWins(player) * 6 - nominations(player) * 7 + (isFinalistStatus(player.status) ? 6 : 0);
  return clamp(derived, 12, 88);
}

function approvalLabel(player: Player, publicOpinion?: PublicOpinionState | null): string {
  return `${Math.round(deriveApproval(player, publicOpinion))}% approval`;
}

function buildFinalists(players: Player[]): Player[] {
  const finalists = players.filter((player) => isFinalistStatus(player.status)).slice(0, 2);
  if (finalists.length === 2) return finalists;
  return [...players]
    .sort((a, b) => {
      const aPlacement = getPlacementValue(a) ?? Number.MAX_SAFE_INTEGER;
      const bPlacement = getPlacementValue(b) ?? Number.MAX_SAFE_INTEGER;
      return aPlacement - bPlacement;
    })
    .slice(0, 2);
}

function buildEvictionList(players: Player[]): Player[] {
  return players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.status === 'evicted' || player.status === 'jury')
    .sort((a, b) => {
      const aPlacement = getPlacementValue(a.player);
      const bPlacement = getPlacementValue(b.player);
      if (aPlacement != null && bPlacement != null) return bPlacement - aPlacement;
      if (aPlacement != null) return -1;
      if (bPlacement != null) return 1;
      return a.index - b.index;
    })
    .map(({ player }) => player);
}

function selectHighest(
  players: Player[],
  score: (player: Player) => number,
  options: { preferDifferentFrom?: Player | null; allowZero?: boolean } = {},
): Player {
  const ranked = [...players].sort((a, b) => score(b) - score(a));
  const allowZero = options.allowZero ?? true;
  const preferred = ranked.find(
    (player) => player.id !== options.preferDifferentFrom?.id && (allowZero || score(player) > 0),
  );
  return preferred ?? ranked.find((player) => allowZero || score(player) > 0) ?? players[0];
}

function selectLowest(players: Player[], score: (player: Player) => number): Player {
  return [...players].sort((a, b) => score(a) - score(b))[0] ?? players[0];
}

function listTabloidPhotos(): string[] {
  return Object.values(TABLOID_PHOTO_MODULES)
    .filter((path) => !path.toLowerCase().endsWith('/readme.md'))
    .sort((a, b) => a.localeCompare(b));
}

function uniqueSources(sources: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  return sources.filter((source): source is string => {
    if (!source || seen.has(source)) return false;
    seen.add(source);
    return true;
  });
}

export function resolveRecapCutoutSources(player: Player): string[] {
  return uniqueSources(resolveInformalCutoutCandidates(player));
}

export function resolveRecapTabloidSources(player: Player, preferredPhoto?: string | null): string[] {
  const primaryAvatar = resolveAvatarCandidates(player).find((candidate) => !candidate.includes('api.dicebear.com'));
  return uniqueSources([
    preferredPhoto,
    resolveInformalCutout(player),
    primaryAvatar,
    resolveSilhouetteFallback(player),
  ]);
}

function buildMontageFragments(players: Player[], week: number): string[] {
  const fragments = players.flatMap((player) => [
    `${player.name.toUpperCase()} • ${totalCompWins(player)} wins`,
    `${player.name.toUpperCase()} • ${nominations(player)} noms`,
  ]);
  fragments.push(`WEEK ${week}`, 'TRIBUNAL LOCKED', 'FINAL TWO');
  return fragments;
}

function buildMontageBeats(players: Player[]): RecapBeat[] {
  const compzilla = selectHighest(players, totalCompWins, { allowZero: false });
  const messFactory = selectHighest(players, nominations, { allowZero: true });

  return [
    {
      id: 'receipts',
      title: 'THE HOUSE KEPT RECEIPTS.',
      support: 'Every move left a mark.',
      visual: 'receipts',
    },
    {
      id: 'alliances',
      title: 'ALLIANCES SHIFTED.',
      support: 'Some aged like milk.',
      visual: 'alliances',
    },
    {
      id: 'block',
      title: 'THE BLOCK CALLED.',
      support: `${firstName(messFactory)} kept hearing it. Again. And again.`,
      visual: 'block',
    },
    {
      id: 'finalists',
      title: 'AND SOMEHOW…',
      support: `${firstName(compzilla)} made sure the season stayed loud until the end.`,
      visual: 'finalists',
    },
  ];
}

function buildCategories(players: Player[], publicOpinion?: PublicOpinionState | null): AwardCategory[] {
  const compzilla = selectHighest(players, totalCompWins, { allowZero: true });
  const headHoncho = selectHighest(players, (player) => player.stats?.lohWins ?? 0, {
    preferDifferentFrom: compzilla,
    allowZero: true,
  });
  const messFactory = selectHighest(players, nominations, { allowZero: true });
  const ghostMode = selectLowest(players, nominations);
  const vibeCurator = selectHighest(players, (player) => deriveApproval(player, publicOpinion), {
    allowZero: true,
  });
  const heatMagnet = selectLowest(players, (player) => deriveApproval(player, publicOpinion));

  return [
    {
      id: 'compzilla',
      name: 'COMPZILLA',
      subtitle: 'Won so often it started looking personal.',
      emoji: '⚡',
      winner: compzilla,
      winnerStat: `${Math.max(totalCompWins(compzilla), 0)} win${totalCompWins(compzilla) === 1 ? '' : 's'}`,
      accentColor: '#f4c15d',
      accentGlow: 'rgba(244, 193, 93, 0.24)',
      bgGradient: 'linear-gradient(180deg, #1b1420 0%, #09070d 56%, #050609 100%)',
      visualVariant: 'compzilla',
    },
    {
      id: 'head_honcho',
      name: 'HEAD HONCHO',
      subtitle: 'Power looked comfortable on them.',
      emoji: '👑',
      winner: headHoncho,
      winnerStat: `${Math.max(headHoncho.stats?.lohWins ?? 0, 0)} reign${(headHoncho.stats?.lohWins ?? 0) === 1 ? '' : 's'}`,
      accentColor: '#b68cff',
      accentGlow: 'rgba(182, 140, 255, 0.22)',
      bgGradient: 'linear-gradient(180deg, #160d24 0%, #090611 58%, #040509 100%)',
      visualVariant: 'head_honcho',
    },
    {
      id: 'mess_factory',
      name: 'MESS FACTORY',
      subtitle: 'Drama didn’t follow them. It moved in.',
      emoji: '🌪️',
      winner: messFactory,
      winnerStat: `${nominations(messFactory)} time${nominations(messFactory) === 1 ? '' : 's'} in trouble`,
      accentColor: '#ff7b6a',
      accentGlow: 'rgba(255, 123, 106, 0.2)',
      bgGradient: 'linear-gradient(180deg, #1b0d11 0%, #090508 58%, #040507 100%)',
      visualVariant: 'mess_factory',
    },
    {
      id: 'ghost_mode',
      name: 'GHOST MODE',
      subtitle: 'Barely seen. Still somehow here.',
      emoji: '👻',
      winner: ghostMode,
      winnerStat: `${nominations(ghostMode)} nomination${nominations(ghostMode) === 1 ? '' : 's'}`,
      accentColor: '#8da5ff',
      accentGlow: 'rgba(141, 165, 255, 0.22)',
      bgGradient: 'linear-gradient(180deg, #0d1630 0%, #070b18 58%, #05060a 100%)',
      visualVariant: 'ghost_mode',
    },
    {
      id: 'vibe_curator',
      name: 'VIBE CURATOR',
      subtitle: 'You could not scroll past them.',
      emoji: '✨',
      winner: vibeCurator,
      winnerStat: approvalLabel(vibeCurator, publicOpinion),
      accentColor: '#69e6c5',
      accentGlow: 'rgba(105, 230, 197, 0.22)',
      bgGradient: 'linear-gradient(180deg, #0a1b1d 0%, #071114 58%, #040608 100%)',
      visualVariant: 'vibe_curator',
    },
    {
      id: 'heat_magnet',
      name: 'HEAT MAGNET',
      subtitle: 'Every storm found this address.',
      emoji: '🔥',
      winner: heatMagnet,
      winnerStat: approvalLabel(heatMagnet, publicOpinion),
      accentColor: '#ff9f63',
      accentGlow: 'rgba(255, 159, 99, 0.22)',
      bgGradient: 'linear-gradient(180deg, #24110f 0%, #120909 58%, #060506 100%)',
      visualVariant: 'heat_magnet',
    },
  ];
}

function buildTabloidCards(
  players: Player[],
  publicOpinion: PublicOpinionState | null | undefined,
  tabloidPhotos: string[],
): TabloidCard[] {
  const publicWinner = selectHighest(players, (player) => deriveApproval(player, publicOpinion));
  const chaosPlayer = selectHighest(players, nominations, { allowZero: true });
  const compPlayer = selectHighest(players, totalCompWins, { allowZero: true });
  const finalists = buildFinalists(players);
  const defaultPlayer = players[0] ?? publicWinner;
  const subjects = [publicWinner, compPlayer, chaosPlayer, finalists[0] ?? defaultPlayer, finalists[1] ?? defaultPlayer];

  return [
    {
      id: 'opinions',
      headline: 'THE HOUSE HAD OPINIONS.',
      subhead: 'Public approval did not come quietly.',
      imageSources: resolveRecapTabloidSources(subjects[0], tabloidPhotos[0]),
      imageAlt: subjects[0]?.name ?? 'Season tabloid cover',
    },
    {
      id: 'saved_again',
      headline: 'SAVED AGAIN?',
      subhead: 'Some exits were postponed by pure chaos.',
      imageSources: resolveRecapTabloidSources(subjects[1], tabloidPhotos[1]),
      imageAlt: subjects[1]?.name ?? 'Housemate reaction',
    },
    {
      id: 'alliances',
      headline: 'ALLIANCES AGED LIKE MILK.',
      subhead: 'Yesterday’s promise became today’s nomination.',
      imageSources: resolveRecapTabloidSources(subjects[2], tabloidPhotos[2]),
      imageAlt: subjects[2]?.name ?? 'Alliance fallout',
    },
    {
      id: 'block_called',
      headline: 'THE BLOCK CALLED.',
      subhead: 'And some people kept answering.',
      imageSources: resolveRecapTabloidSources(subjects[3], tabloidPhotos[3]),
      imageAlt: subjects[3]?.name ?? 'Nomination fallout',
    },
    {
      id: 'classified',
      headline: 'SEASON FILES: CLASSIFIED',
      subhead: 'Until tonight.',
      imageSources: resolveRecapTabloidSources(subjects[4] ?? subjects[3], tabloidPhotos[4] ?? tabloidPhotos[3]),
      imageAlt: subjects[4]?.name ?? 'Finale file',
    },
  ];
}

function buildEvictionWaves(evictionLadder: Player[]): EvictionWave[] {
  const captions = ['the house got smaller.', 'the noise got louder.', 'the end got closer.'];
  if (evictionLadder.length === 0) {
    return [{ id: 'wave-0', players: [], caption: captions[0] }];
  }

  const waveCount = Math.max(1, Math.min(5, Math.ceil(evictionLadder.length / 2)));
  const chunkSize = Math.max(1, Math.ceil(evictionLadder.length / waveCount));
  const waves: EvictionWave[] = [];

  for (let index = 0; index < evictionLadder.length; index += chunkSize) {
    waves.push({
      id: `wave-${waves.length}`,
      players: evictionLadder.slice(index, index + chunkSize),
      caption: captions[waves.length % captions.length],
    });
  }

  return waves;
}

export function buildSeasonRecapData(
  players: Player[],
  week: number,
  publicOpinion?: PublicOpinionState | null,
): RecapData {
  const safePlayers = players.length > 0 ? players : [{ id: 'placeholder', name: `Week ${week}`, avatar: '', status: 'evicted' as const }];
  const tabloidPhotoSources = listTabloidPhotos();
  const evictionLadder = buildEvictionList(safePlayers);

  return {
    montageBeats: buildMontageBeats(safePlayers),
    montageFragments: buildMontageFragments(safePlayers, week),
    categories: buildCategories(safePlayers, publicOpinion),
    tabloidCards: buildTabloidCards(safePlayers, publicOpinion, tabloidPhotoSources),
    evictionWaves: buildEvictionWaves(evictionLadder),
    evictionLadder,
    finalists: buildFinalists(safePlayers),
    tabloidPhotoSources,
  };
}
