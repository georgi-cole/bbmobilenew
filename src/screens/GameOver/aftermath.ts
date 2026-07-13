import { resolveRecapTabloidSources } from '../../components/SeasonRecapCinematic/seasonRecapData';
import type { Player } from '../../types';

export type AftermathTone = 'excellent' | 'good' | 'neutral' | 'bad' | 'tragic';

export interface AftermathStory {
  playerId: string;
  playerName: string;
  placementLabel: string;
  tone: AftermathTone;
  toneLabel: string;
  headline: string;
  subheadline: string;
  body: string;
  bulletPoints: string[];
  imageSources: string[];
}

interface TabloidPhotoEntry {
  id: string;
  matchToken: string;
  extension: string;
  source: string;
}

interface AftermathScenarioTemplate {
  tone: AftermathTone;
  toneLabel: string;
  headline: (firstName: string) => string;
  subheadline: (firstName: string) => string;
  body: (firstName: string) => string;
  bulletPoints: (firstName: string) => [string, string];
}

const TABLOID_PHOTO_MODULES = import.meta.glob('../../../public/assets/tabloid_photos/*.{png,jpg,jpeg,jxl,webp,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const AFTERMATH_ASSET_BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

const AFTERMATH_SCENARIOS: Record<AftermathTone, AftermathScenarioTemplate[]> = {
  excellent: [
    {
      tone: 'excellent',
      toneLabel: 'Excellent',
      headline: (firstName) => `${firstName} Cashes In Fast`,
      subheadline: (firstName) => `${firstName} turns finale buzz into a luxury comeback tour and does not look back.`,
      body: (firstName) =>
        `${firstName} books a glossy streaming special, launches a suspiciously expensive lifestyle line, and keeps saying the cameras finally captured the "real me."`,
      bulletPoints: (firstName) => [
        `${firstName} signs a six-figure brand deal after one dramatic breakfast interview.`,
        'Fans call it the cleanest post-show glow-up of the season.',
      ],
    },
    {
      tone: 'excellent',
      toneLabel: 'Excellent',
      headline: (firstName) => `${firstName} Becomes Prime-Time Gold`,
      subheadline: (firstName) => `${firstName} lands every red carpet invite before the confetti is even swept up.`,
      body: (firstName) =>
        `${firstName} pivots from house drama to celebrity darling status, smiling through flashbulbs while rivals insist they "always knew this would happen."`,
      bulletPoints: (firstName) => [
        `${firstName} gets spotted leaving a TV studio with a mystery executive.`,
        'A tabloid poll names them the season’s biggest winner off-camera too.',
      ],
    },
  ],
  good: [
    {
      tone: 'good',
      toneLabel: 'Good',
      headline: (firstName) => `${firstName} Finds the Sweet Spot`,
      subheadline: (firstName) => `${firstName} stays booked, liked, and just messy enough to stay interesting.`,
      body: (firstName) =>
        `${firstName} settles into the influencer circuit, stacks a few tasteful sponsorships, and keeps reunion gossip alive with perfectly timed vague posts.`,
      bulletPoints: (firstName) => [
        `${firstName} starts a recap podcast with a shocking number of listeners.`,
        'The comment section mostly agrees this is solid damage control.',
      ],
    },
    {
      tone: 'good',
      toneLabel: 'Good',
      headline: (firstName) => `${firstName} Leaves With Momentum`,
      subheadline: (firstName) => `${firstName} turns public curiosity into a surprisingly polished second act.`,
      body: (firstName) =>
        `${firstName} keeps the fame at a manageable simmer, showing up at enough events to stay relevant without becoming everyone’s full-time group chat topic.`,
      bulletPoints: (firstName) => [
        `${firstName} quietly books a hosting gig no one saw coming.`,
        'Even the haters admit the rollout looks annoyingly competent.',
      ],
    },
  ],
  neutral: [
    {
      tone: 'neutral',
      toneLabel: 'Neutral',
      headline: (firstName) => `${firstName} Chooses Peace and Wi-Fi`,
      subheadline: (firstName) => `${firstName} skips the circus, posts twice, then vanishes into suspicious tranquility.`,
      body: (firstName) =>
        `${firstName} returns to ordinary life with a calm smile, one oddly cryptic live stream, and a strict refusal to explain the finale group chat leak.`,
      bulletPoints: (firstName) => [
        `${firstName} says they are "focusing on real life for now."`,
        'The internet cannot decide whether this is maturity or a soft launch.',
      ],
    },
    {
      tone: 'neutral',
      toneLabel: 'Neutral',
      headline: (firstName) => `${firstName} Keeps It Mysterious`,
      subheadline: (firstName) => `${firstName} neither flames out nor cashes in, which somehow becomes its own headline.`,
      body: (firstName) =>
        `${firstName} drifts into that strange post-show middle ground where every public sighting feels important even though absolutely nothing dramatic is confirmed.`,
      bulletPoints: (firstName) => [
        `${firstName} is seen twice at the same cafe and once at a very normal supermarket.`,
        'A fake engagement rumor survives for forty-eight glorious hours.',
      ],
    },
  ],
  bad: [
    {
      tone: 'bad',
      toneLabel: 'Bad',
      headline: (firstName) => `${firstName} Cannot Stop Posting`,
      subheadline: (firstName) => `${firstName} picks three avoidable feuds and somehow loses all of them by lunch.`,
      body: (firstName) =>
        `${firstName} treats every rumor like a personal challenge, fires off late-night responses, and accidentally turns a tiny misunderstanding into a multi-week mess.`,
      bulletPoints: (firstName) => [
        `${firstName} uploads an apology note, deletes it, then blames "team confusion."`,
        'A reunion seating chart becomes a full scandal for no good reason.',
      ],
    },
    {
      tone: 'bad',
      toneLabel: 'Bad',
      headline: (firstName) => `${firstName} Hits a Rough Patch`,
      subheadline: (firstName) => `${firstName} exits the house and walks straight into a publicity pothole.`,
      body: (firstName) =>
        `${firstName} fumbles an easy victory lap, overexplains old alliances in every interview, and ends up more memed than celebrated by the end of the month.`,
      bulletPoints: (firstName) => [
        `${firstName} gets ratioed by fans after trying to "clear things up."`,
        'One leaked voice note keeps reappearing like an unpaid bill.',
      ],
    },
  ],
  tragic: [
    {
      tone: 'tragic',
      toneLabel: 'Tragic',
      headline: (firstName) => `${firstName}'s Comeback Implodes`,
      subheadline: (firstName) => `${firstName} announces a dramatic rebrand that collapses before the merch even ships.`,
      body: (firstName) =>
        `${firstName} aims for icon status, but the whole operation spirals into a chaotic cautionary tale involving a doomed launch party and one very hostile entertainment blogger.`,
      bulletPoints: (firstName) => [
        `${firstName}'s victory brunch ends with three ex-allies live-posting subtweets.`,
        'Even the gossip channels describe the fallout as "cinematic."',
      ],
    },
    {
      tone: 'tragic',
      toneLabel: 'Tragic',
      headline: (firstName) => `${firstName} Suffers a Public Meltdown Arc`,
      subheadline: (firstName) => `${firstName} goes for a grand post-show reinvention and trips over every possible rake.`,
      body: (firstName) =>
        `${firstName} books a tell-all, leaks their own teaser, starts a feud with a stylist, and somehow ends the week apologizing to a morning show audience.`,
      bulletPoints: (firstName) => [
        `${firstName} gets dropped from an appearance after a very messy comment spiral.`,
        'The tabloids celebrate the chaos with ruthless front pages for days.',
      ],
    },
  ],
};

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function firstName(player: Player | undefined): string {
  return player?.name.split(' ')[0] ?? 'Housemate';
}

function extensionPriority(extension: string): number {
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

function listTabloidPhotos(): TabloidPhotoEntry[] {
  return Object.keys(TABLOID_PHOTO_MODULES)
    .map((path) => {
      const filename = path.split('/').pop() ?? path;
      const extension = filename.split('.').pop() ?? '';
      const basename = filename.replace(/\.[^.]+$/, '');
      const matchBase = basename.replace(/_tabloid\d*$/i, '');
      return {
        id: basename,
        matchToken: normalizeToken(matchBase),
        extension,
        source: `${AFTERMATH_ASSET_BASE}assets/tabloid_photos/${encodeURIComponent(filename)}`,
      };
    })
    .sort((left, right) => {
      if (left.matchToken !== right.matchToken) {
        return left.matchToken.localeCompare(right.matchToken);
      }
      const extensionDifference = extensionPriority(left.extension) - extensionPriority(right.extension);
      if (extensionDifference !== 0) {
        return extensionDifference;
      }
      return left.id.localeCompare(right.id);
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
  const tokens = uniqueSources([player?.name, firstName(player)]).map(normalizeToken);
  if (player?.id === 'ali' || player?.name === 'Ali') {
    tokens.push(normalizeToken('Lia'));
  }
  return [...new Set(tokens)];
}

function pickTabloidPhoto(
  player: Player | undefined,
  photos: TabloidPhotoEntry[],
  usedPhotoIds: Set<string>,
): string | null {
  if (photos.length === 0) return null;
  const desiredTokens = getTabloidMatchTokens(player);
  const matched = photos.find(
    (photo) => !usedPhotoIds.has(photo.id) && desiredTokens.includes(photo.matchToken),
  );
  if (matched) {
    usedPhotoIds.add(matched.id);
    return matched.source;
  }

  const unusedFallback = photos.find((photo) => !usedPhotoIds.has(photo.id));
  if (unusedFallback) {
    usedPhotoIds.add(unusedFallback.id);
    return unusedFallback.source;
  }

  return photos[0]?.source ?? null;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getPlacementValue(player: Player): number {
  if (typeof player.finalRank === 'number') return player.finalRank;
  if (typeof player.seasonPlacement === 'number') return player.seasonPlacement;
  if (player.isWinner) return 1;
  return Number.MAX_SAFE_INTEGER;
}

function getPlacementLabel(player: Player): string {
  const placement = getPlacementValue(player);
  if (placement === 1) return 'Winner';
  if (placement === 2) return 'Runner-up';
  if (placement === 3) return 'Third place';
  if (placement !== Number.MAX_SAFE_INTEGER) return `Placed #${placement}`;
  if (player.status === 'jury') return 'Juror';
  if (player.status === 'evicted') return 'Evicted';
  return 'Housemate';
}

function sortPlayers(players: Player[]): Player[] {
  return [...players].sort((left, right) => {
    const placementDifference = getPlacementValue(left) - getPlacementValue(right);
    if (placementDifference !== 0) return placementDifference;
    return left.name.localeCompare(right.name);
  });
}

function selectScenario(player: Player, season: number): AftermathScenarioTemplate {
  const toneOrder: AftermathTone[] = ['excellent', 'good', 'neutral', 'bad', 'tragic'];
  const tone = toneOrder[hashString(`${season}:${player.id}:tone`) % toneOrder.length];
  const templates = AFTERMATH_SCENARIOS[tone];
  return templates[hashString(`${season}:${player.id}:scenario`) % templates.length];
}

export function buildAftermathStories(players: Player[], season: number): AftermathStory[] {
  const sortedPlayers = sortPlayers(players);
  const safePlayers = sortedPlayers.length > 0
    ? sortedPlayers
    : [{
        id: 'house',
        name: 'The House',
        avatar: '',
        status: 'evicted' as const,
      }];
  const tabloidPhotos = listTabloidPhotos();
  const usedPhotoIds = new Set<string>();

  return safePlayers.map((player) => {
    const scenario = selectScenario(player, season);
    const matchedPhoto = pickTabloidPhoto(player, tabloidPhotos, usedPhotoIds);
    const name = firstName(player);

    return {
      playerId: player.id,
      playerName: player.name,
      placementLabel: getPlacementLabel(player),
      tone: scenario.tone,
      toneLabel: scenario.toneLabel,
      headline: scenario.headline(name),
      subheadline: scenario.subheadline(name),
      body: scenario.body(name),
      bulletPoints: scenario.bulletPoints(name),
      imageSources: resolveRecapTabloidSources(player, matchedPhoto),
    };
  });
}
