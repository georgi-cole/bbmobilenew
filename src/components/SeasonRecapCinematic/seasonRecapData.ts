import type { Player } from '../../types';
import type { PublicOpinionState } from '../../publicOpinion/types';
import {
  resolveAvatarCandidates,
  resolveInformalCutout,
  resolveInformalCutoutCandidates,
  resolveSilhouetteFallback,
} from '../../utils/avatar';

const TABLOID_PHOTO_MODULES = import.meta.glob('../../../public/assets/tabloid_photos/*.{png,jpg,jpeg,jxl,webp,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const RECAP_ASSET_BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

interface TabloidPhotoEntry {
  id: string;
  matchToken: string;
  extension: string;
  source: string;
}

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
  articleText: string;
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

export function deriveEvictionFallbackPlacement(evictionLadderLength: number, ladderIndex: number): number {
  return evictionLadderLength - ladderIndex + 2;
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

function normalizePhotoToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function tabloidPhotoExtensionPriority(extension: string): number {
  switch (extension.toLowerCase()) {
    case 'webp':
      return 0;
    case 'jxl':
      return 1;
    case 'png':
      return 2;
    case 'jpg':
    case 'jpeg':
      return 3;
    case 'avif':
      return 4;
    default:
      return 5;
  }
}

function listTabloidPhotoEntries(): TabloidPhotoEntry[] {
  return Object.keys(TABLOID_PHOTO_MODULES)
    .map((path) => {
      const filename = path.split('/').pop() ?? path;
      const extension = filename.split('.').pop() ?? '';
      const basename = filename.replace(/\.[^.]+$/, '');
      const matchBase = basename.replace(/_tabloid\d*$/i, '');
      return {
        id: basename,
        matchToken: normalizePhotoToken(matchBase),
        extension,
        source: `${RECAP_ASSET_BASE}assets/tabloid_photos/${encodeURIComponent(filename)}`,
      };
    })
    .sort((a, b) => {
      if (a.matchToken !== b.matchToken) return a.matchToken.localeCompare(b.matchToken);
      const extensionPriorityDifference =
        tabloidPhotoExtensionPriority(a.extension) - tabloidPhotoExtensionPriority(b.extension);
      if (extensionPriorityDifference !== 0) return extensionPriorityDifference;
      return a.id.localeCompare(b.id);
    });
}

function uniqueSources(sources: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  return sources.filter((source): source is string => {
    if (!source || seen.has(source)) return false;
    seen.add(source);
    return true;
  });
}

function getTabloidMatchTokens(player: Player | undefined): string[] {
  const tokens = uniqueSources([
    player?.name,
    player?.name.split(' ')[0],
  ]).map(normalizePhotoToken);

  if (player?.id === 'ali' || player?.name === 'Ali') {
    tokens.push(normalizePhotoToken('Lia'));
  }

  return [...new Set(tokens)];
}

function isDicebearCandidate(candidate: string): boolean {
  try {
    const parsed = new URL(candidate, typeof window !== 'undefined' ? window.location.origin : 'https://bbmobilenew.local');
    return parsed.hostname === 'api.dicebear.com';
  } catch {
    return false;
  }
}

export function resolveRecapCutoutSources(player: Player): string[] {
  return uniqueSources(resolveInformalCutoutCandidates(player));
}

export function resolveRecapTabloidSources(player: Player, preferredPhoto?: string | null): string[] {
  const primaryAvatar = resolveAvatarCandidates(player).find((candidate) => !isDicebearCandidate(candidate));
  return uniqueSources([
    preferredPhoto,
    resolveInformalCutout(player),
    primaryAvatar,
    resolveSilhouetteFallback(player),
  ]);
}

function pickTabloidPhoto(
  player: Player | undefined,
  tabloidPhotos: TabloidPhotoEntry[],
  usedPhotoIds: Set<string>,
): string | null {
  if (tabloidPhotos.length === 0) return null;
  const desiredTokens = getTabloidMatchTokens(player);

  const matchedPhoto = tabloidPhotos.find(
    (entry) => !usedPhotoIds.has(entry.id) && desiredTokens.includes(entry.matchToken),
  );
  if (matchedPhoto) {
    usedPhotoIds.add(matchedPhoto.id);
    return matchedPhoto.source;
  }

  const unusedFallback = tabloidPhotos.find((entry) => !usedPhotoIds.has(entry.id)) ?? tabloidPhotos[0];
  usedPhotoIds.add(unusedFallback.id);
  return unusedFallback.source;
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
      winnerStat: `${Math.max(totalCompWins(compzilla), 0)} comp${totalCompWins(compzilla) === 1 ? '' : 's'} won`,
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
  tabloidPhotos: TabloidPhotoEntry[],
): TabloidCard[] {
  const publicWinner = selectHighest(players, (player) => deriveApproval(player, publicOpinion));
  const chaosPlayer = selectHighest(players, nominations, { allowZero: true });
  const compPlayer = selectHighest(players, totalCompWins, { allowZero: true });
  const finalists = buildFinalists(players);
  const defaultPlayer = players[0] ?? publicWinner;
  const subjects = [publicWinner, compPlayer, chaosPlayer, finalists[0] ?? defaultPlayer, finalists[1] ?? defaultPlayer];
  const usedPhotoIds = new Set<string>();

  return [
    {
      id: 'opinions',
      headline: 'THE HOUSE HAD OPINIONS.',
      subhead: 'Public approval did not come quietly.',
      articleText: `${firstName(subjects[0])} owned the season’s loudest headlines while every vote swing sent the crowd back to the comments.`,
      imageSources: resolveRecapTabloidSources(subjects[0], pickTabloidPhoto(subjects[0], tabloidPhotos, usedPhotoIds)),
      imageAlt: subjects[0]?.name ?? 'Season tabloid cover',
    },
    {
      id: 'saved_again',
      headline: 'SAVED AGAIN?',
      subhead: 'Some exits were postponed by pure chaos.',
      articleText: `${firstName(subjects[1])} kept turning crisis weeks into survival stories, leaving the rest of the house to rework the plan overnight.`,
      imageSources: resolveRecapTabloidSources(subjects[1], pickTabloidPhoto(subjects[1], tabloidPhotos, usedPhotoIds)),
      imageAlt: subjects[1]?.name ?? 'Housemate reaction',
    },
    {
      id: 'alliances',
      headline: 'ALLIANCES AGED LIKE MILK.',
      subhead: 'Yesterday’s promise became today’s nomination.',
      articleText: `${firstName(subjects[2])} stood at the center of whispered deals, broken promises, and the kind of fallout tabloids print in bold.`,
      imageSources: resolveRecapTabloidSources(subjects[2], pickTabloidPhoto(subjects[2], tabloidPhotos, usedPhotoIds)),
      imageAlt: subjects[2]?.name ?? 'Alliance fallout',
    },
    {
      id: 'block_called',
      headline: 'THE BLOCK CALLED.',
      subhead: 'And some people kept answering.',
      articleText: `${firstName(subjects[3])} felt the pressure, wore it, and still made it through the season’s messiest stretches.`,
      imageSources: resolveRecapTabloidSources(subjects[3], pickTabloidPhoto(subjects[3], tabloidPhotos, usedPhotoIds)),
      imageAlt: subjects[3]?.name ?? 'Nomination fallout',
    },
    {
      id: 'classified',
      headline: 'SEASON FILES: CLASSIFIED',
      subhead: 'Until tonight.',
      articleText: `${firstName(subjects[4] ?? subjects[3])} made the final chapter, where every headline shrinks down to one last verdict.`,
      imageSources: resolveRecapTabloidSources(
        subjects[4] ?? subjects[3],
        pickTabloidPhoto(subjects[4] ?? subjects[3], tabloidPhotos, usedPhotoIds),
      ),
      imageAlt: subjects[4]?.name ?? 'Finale file',
    },
  ];
}

function buildEvictionWaves(evictionLadder: Player[]): EvictionWave[] {
  const captions = ['the early exits.', 'then the race tightened.'];
  if (evictionLadder.length === 0) {
    return [{ id: 'wave-0', players: [], caption: captions[0] }];
  }

  if (evictionLadder.length <= 7) {
    return [{ id: 'wave-0', players: evictionLadder, caption: captions[0] }];
  }

  const [earlyEvictions, lateEvictions] = evictionLadder.reduce<[Player[], Player[]]>(
    (groups, player, index) => {
      const placementValue = getPlacementValue(player) ?? deriveEvictionFallbackPlacement(evictionLadder.length, index);
      const target = placementValue >= 10 ? 0 : 1;
      groups[target].push(player);
      return groups;
    },
    [[], []],
  );
  const groupedWaves =
    earlyEvictions.length > 0 && lateEvictions.length > 0
      ? [earlyEvictions, lateEvictions]
      : [evictionLadder.slice(0, Math.ceil(evictionLadder.length / 2)), evictionLadder.slice(Math.ceil(evictionLadder.length / 2))];

  return groupedWaves
    .filter((players) => players.length > 0)
    .map((players, index) => ({
      id: `wave-${index}`,
      players,
      caption: captions[index % captions.length],
    }));
}

export function buildSeasonRecapData(
  players: Player[],
  week: number,
  publicOpinion?: PublicOpinionState | null,
): RecapData {
  const safePlayers = players.length > 0
    ? players
    : [{
        id: 'placeholder',
        name: `Week ${week}`,
        avatar: '',
        status: 'evicted' as const,
        stats: {
          lohWins: 0,
          posWins: 0,
          timesNominated: 0,
        },
        seasonPlacement: 1,
      }];
  const tabloidPhotoEntries = listTabloidPhotoEntries();
  const tabloidPhotoSources = tabloidPhotoEntries.map((entry) => entry.source);
  const evictionLadder = buildEvictionList(safePlayers);

  return {
    montageBeats: buildMontageBeats(safePlayers),
    montageFragments: buildMontageFragments(safePlayers, week),
    categories: buildCategories(safePlayers, publicOpinion),
    tabloidCards: buildTabloidCards(safePlayers, publicOpinion, tabloidPhotoEntries),
    evictionWaves: buildEvictionWaves(evictionLadder),
    evictionLadder,
    finalists: buildFinalists(safePlayers),
    tabloidPhotoSources,
  };
}
