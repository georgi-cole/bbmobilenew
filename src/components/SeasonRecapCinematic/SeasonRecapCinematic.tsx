import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Player } from '../../types';
import type { PublicOpinionState } from '../../publicOpinion/types';
import { resolveAvatar } from '../../utils/avatar';
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage';
import FinaleNewspaperMontage, { type FinaleMontageNote } from './FinaleNewspaperMontage';
import { createNewspaperFrontPage, type NewspaperFrontPageData, type NewspaperSeasonEvent } from './newspaperFrontPages';
import './SeasonRecapCinematic.css';

export interface SeasonRecapProps {
  season: number;
  week: number;
  players: Player[];
  publicOpinion?: PublicOpinionState | null;
  onComplete: () => void;
}

// ─── Scene timing ─────────────────────────────────────────────────────────────

interface SceneTiming {
  /** Unique scene key used as React key and for kind detection. */
  id: string;
  durationMs: number;
}

const SCENE_DURATIONS = {
  intro_1: 2800,
  intro_2: 3200,
  intro_3: 3400,
  montage: 5200,
  category: 4800,
  ladder: 9000,
  finale: 5500,
} as const;

const RECAP_EXIT_FADE_MS = 420;

function buildSceneTimings(categoryCount: number): SceneTiming[] {
  const timings: SceneTiming[] = [
    { id: 'intro_1', durationMs: SCENE_DURATIONS.intro_1 },
    { id: 'intro_2', durationMs: SCENE_DURATIONS.intro_2 },
    { id: 'intro_3', durationMs: SCENE_DURATIONS.intro_3 },
    { id: 'montage', durationMs: SCENE_DURATIONS.montage },
  ];
  for (let i = 0; i < categoryCount; i++) {
    timings.push({ id: `cat_${i}`, durationMs: SCENE_DURATIONS.category });
  }
  timings.push(
    { id: 'ladder', durationMs: SCENE_DURATIONS.ladder },
    { id: 'finale', durationMs: SCENE_DURATIONS.finale },
  );
  return timings;
}

// ─── Data types ───────────────────────────────────────────────────────────────

interface RecapBeat {
  kicker: string;
  line: string;
  subject?: Player | null;
}

interface AwardCategory {
  id: string;
  name: string;
  subtitle: string;
  emoji: string;
  winner: Player;
  winnerStat: string;
  accentColor: string;
  bgGradient: string;
}

interface RecapData {
  dramaBeats: RecapBeat[];
  tabloidPages: NewspaperFrontPageData[];
  tabloidNotes: FinaleMontageNote[];
  categories: AwardCategory[];
  evictionLadder: Player[];
  finalists: Player[];
}

type CatAccentStyle = CSSProperties & {
  '--cat-accent': string;
  '--cat-gradient': string;
};

// ─── Player helpers ───────────────────────────────────────────────────────────

function firstName(player: Player | null | undefined): string {
  return player?.name.split(' ')[0] ?? 'A finalist';
}

function totalCompWins(player: Player): number {
  return (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0);
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
    status === 'nominated' ||
    status === 'loh+pos' ||
    status === 'nominated+pos'
  );
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

function buildFinalists(players: Player[]): Player[] {
  return players.filter((player) => isFinalistStatus(player.status)).slice(0, 2);
}

function approvalPercent(value: number | null | undefined, fallback = 50): string {
  return `${Math.round(value ?? fallback)}%`;
}

function placementLabel(placement: number): string {
  const mod100 = placement % 100;
  const mod10 = placement % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${placement}th`;
  if (mod10 === 1) return `${placement}st`;
  if (mod10 === 2) return `${placement}nd`;
  if (mod10 === 3) return `${placement}rd`;
  return `${placement}th`;
}

// ─── Category builder ─────────────────────────────────────────────────────────

const MAX_CATEGORIES = 6;

function buildCategories(
  players: Player[],
  publicOpinion?: PublicOpinionState | null,
): AwardCategory[] {
  const categories: AwardCategory[] = [];
  const used = new Set<string>();

  // 1. Compzilla — most total comp wins
  const topComp = players.reduce<Player | null>((best, p) => {
    const wins = totalCompWins(p);
    if (wins === 0) return best;
    if (!best || wins > totalCompWins(best)) return p;
    return best;
  }, null);
  if (topComp && totalCompWins(topComp) > 0) {
    used.add(topComp.id);
    const wins = totalCompWins(topComp);
    categories.push({
      id: 'compzilla',
      name: 'Compzilla',
      subtitle: 'Built different on game day.',
      emoji: '\u26a1',
      winner: topComp,
      winnerStat: `${wins} competition win${wins !== 1 ? 's' : ''}`,
      accentColor: '#f59e0b',
      bgGradient: 'linear-gradient(160deg, rgba(245,158,11,0.18) 0%, rgba(2,4,13,0.96) 55%)',
    });
  }

  // 2. Head Honcho — most LOH wins (skip if same person already won Compzilla)
  const topLoh = players.reduce<Player | null>((best, p) => {
    const wins = p.stats?.lohWins ?? 0;
    if (wins === 0) return best;
    if (!best || wins > (best.stats?.lohWins ?? 0)) return p;
    return best;
  }, null);
  if (topLoh && (topLoh.stats?.lohWins ?? 0) > 0 && !used.has(topLoh.id)) {
    used.add(topLoh.id);
    const wins = topLoh.stats?.lohWins ?? 0;
    categories.push({
      id: 'head_honcho',
      name: 'Head Honcho',
      subtitle: 'Power looked good here.',
      emoji: '\ud83d\udc51',
      winner: topLoh,
      winnerStat: `${wins} HOH win${wins !== 1 ? 's' : ''}`,
      accentColor: '#7c3aed',
      bgGradient: 'linear-gradient(160deg, rgba(124,58,237,0.22) 0%, rgba(2,4,13,0.96) 55%)',
    });
  }

  // 3. Mess Factory — most nominated
  const mostNom = players.reduce<Player | null>((most, p) => {
    if (!most || (p.stats?.timesNominated ?? 0) > (most.stats?.timesNominated ?? 0)) return p;
    return most;
  }, null);
  if (mostNom && (mostNom.stats?.timesNominated ?? 0) > 0) {
    used.add(mostNom.id);
    const noms = mostNom.stats?.timesNominated ?? 0;
    categories.push({
      id: 'mess_factory',
      name: 'Mess Factory',
      subtitle: 'Peace never stood a chance.',
      emoji: '\ud83c\udf2a\ufe0f',
      winner: mostNom,
      winnerStat: `${noms}\u00d7 on the block`,
      accentColor: '#ef4444',
      bgGradient: 'linear-gradient(160deg, rgba(239,68,68,0.18) 0%, rgba(2,4,13,0.96) 55%)',
    });
  }

  // 4. Ghost Mode — fewest nominations across all players
  // The ghost player may be the same person who won another category; that is
  // intentional — a dominant floater winning both is part of the story.
  const allReachPlayers = players.filter(
    (p) => isFinalistStatus(p.status) || p.status === 'jury' || p.status === 'evicted',
  );
  // Sort by nominations ascending, then prefer a player not already used for variety.
  const ghostSorted = [...allReachPlayers].sort(
    (a, b) => (a.stats?.timesNominated ?? 0) - (b.stats?.timesNominated ?? 0),
  );
  const ghostPlayer =
    ghostSorted.find((p) => !used.has(p.id)) ?? ghostSorted[0] ?? null;
  if (ghostPlayer) {
    used.add(ghostPlayer.id);
    const noms = ghostPlayer.stats?.timesNominated ?? 0;
    categories.push({
      id: 'ghost_mode',
      name: 'Ghost Mode',
      subtitle: noms === 0 ? 'Untouched. Unbothered. Unavailable.' : 'Too slick to touch.',
      emoji: '\ud83d\udc7b',
      winner: ghostPlayer,
      winnerStat: noms === 0 ? 'never nominated' : `only ${noms} nomination${noms !== 1 ? 's' : ''}`,
      accentColor: '#6366f1',
      bgGradient: 'linear-gradient(160deg, rgba(99,102,241,0.2) 0%, rgba(2,4,13,0.96) 55%)',
    });
  }

  // 5 & 6. Public opinion categories
  if (publicOpinion && categories.length < MAX_CATEGORIES) {
    const publicProfiles = players
      .map((p) => ({ player: p, profile: publicOpinion.profiles[p.id] }))
      .filter(
        (
          entry,
        ): entry is {
          player: Player;
          profile: NonNullable<PublicOpinionState['profiles'][string]>;
        } => Boolean(entry.profile),
      )
      .sort((a, b) => b.profile.approval - a.profile.approval);

    const mostLiked = publicProfiles[0];
    const mostHated = publicProfiles[publicProfiles.length - 1];

    if (mostLiked) {
      // Allow the same person to win multiple categories — a standout player
      // dominating both the game and public opinion is its own story.
      used.add(mostLiked.player.id);
      categories.push({
        id: 'vibe_curator',
        name: 'Vibe Curator',
        subtitle: 'You could not scroll past them.',
        emoji: '\u2728',
        winner: mostLiked.player,
        winnerStat: `${approvalPercent(mostLiked.profile.approval)} approval`,
        accentColor: '#10b981',
        bgGradient: 'linear-gradient(160deg, rgba(16,185,129,0.18) 0%, rgba(2,4,13,0.96) 55%)',
      });
    }

    if (
      mostHated &&
      mostHated.player.id !== mostLiked?.player.id &&
      categories.length < MAX_CATEGORIES
    ) {
      categories.push({
        id: 'heat_magnet',
        name: 'Heat Magnet',
        subtitle: 'Every storm found this address.',
        emoji: '\ud83d\udd25',
        winner: mostHated.player,
        winnerStat: `${approvalPercent(mostHated.profile.approval)} approval`,
        accentColor: '#dc2626',
        bgGradient: 'linear-gradient(160deg, rgba(220,38,38,0.2) 0%, rgba(2,4,13,0.96) 55%)',
      });
    }
  }

  return categories;
}

// ─── Recap data builder ───────────────────────────────────────────────────────

function buildRecapData(
  players: Player[],
  week: number,
  publicOpinion?: PublicOpinionState | null,
): RecapData {
  const evictionLadder = buildEvictionList(players);
  const finalists = buildFinalists(players);

  const topComp = players.reduce<Player | null>((best, p) => {
    if (!best) return p;
    return totalCompWins(p) > totalCompWins(best) ? p : best;
  }, null);
  const mostNom = players.reduce<Player | null>((most, p) => {
    if (!most) return p;
    return (p.stats?.timesNominated ?? 0) > (most.stats?.timesNominated ?? 0) ? p : most;
  }, null);
  const topVeto = players.reduce<Player | null>((best, p) => {
    if (!best) return p;
    return (p.stats?.posWins ?? 0) > (best.stats?.posWins ?? 0) ? p : best;
  }, null);

  const dramaBeats: RecapBeat[] = [
    {
      kicker: 'THE GAME BEGAN',
      line: `${firstName(topComp)} built momentum. The house followed the power.`,
      subject: topComp,
    },
    {
      kicker: 'TRUST FRACTURED',
      line: `${firstName(mostNom)} kept hearing their name \u2014 and kept surviving anyway.`,
      subject: mostNom,
    },
    {
      kicker: 'EVERYTHING SHIFTED',
      line: `${firstName(topVeto)} turned safety into leverage when it mattered most.`,
      subject: topVeto,
    },
    {
      kicker: `${week} WEEKS OF CHAOS`,
      line: 'Alliances formed. Alliances burned. Not necessarily in that order.',
      subject: null,
    },
  ];

  const categories = buildCategories(players, publicOpinion);
  const { tabloidPages, tabloidNotes } = buildTabloidRecap(players, week, dramaBeats, publicOpinion);

  return {
    dramaBeats,
    tabloidPages,
    tabloidNotes,
    categories,
    evictionLadder,
    finalists,
  };
}

function findPlayerById(players: Player[], playerId: string | undefined): Player | null {
  if (!playerId) return null;
  return players.find((player) => player.id === playerId) ?? null;
}

function resolveTabloidImage(player: Player | null | undefined): string {
  return player ? resolveAvatar(player) : '/assets/houseguests/houseguest-1.jpg';
}

function buildTabloidRecap(
  players: Player[],
  week: number,
  beats: RecapBeat[],
  publicOpinion?: PublicOpinionState | null,
): { tabloidPages: NewspaperFrontPageData[]; tabloidNotes: FinaleMontageNote[] } {
  const playerPool = players.length > 0 ? players : [];
  const topComp = beats[0]?.subject ?? playerPool[0] ?? null;
  const mostNom = beats[1]?.subject ?? playerPool[1] ?? topComp;
  const topVeto = beats[2]?.subject ?? playerPool[2] ?? mostNom;
  const topVetoName = firstName(topVeto);
  const mostNomName = firstName(mostNom);
  const finalists = buildFinalists(players);

  const publicHeadlineEvents: NewspaperSeasonEvent[] = (publicOpinion?.feed ?? [])
    .filter((post) => post.isHeadline)
    .slice(0, 2)
    .map((post, index) => {
      const subject = findPlayerById(players, post.playerId);
      return {
        id: `public-${post.id}`,
        week: post.week || Math.max(1, week - 2 + index),
        type: post.delta < 0 ? 'backlash' : 'fan-favorite',
        subjectName: subject?.name,
        detail: post.text,
      };
    });

  const fallbackEvents: NewspaperSeasonEvent[] = [
    {
      id: 'recap-power-shift',
      week: Math.max(1, week - 3),
      type: 'veto',
      subjectName: topVeto?.name,
      detail: `${topVetoName} turned one ceremony into a full-house scramble.`,
    },
    {
      id: 'recap-underdog',
      week: Math.max(1, week - 2),
      type: 'underdog',
      subjectName: mostNom?.name,
      detail: `${mostNomName} survived the spotlight long enough to become headline material.`,
    },
    {
      id: 'recap-finale',
      week,
      type: 'finale',
      subjectName: finalists[0]?.name ?? topComp?.name,
      secondaryName: finalists[1]?.name ?? mostNom?.name,
      detail: 'The jury, the crowd, and every camera are pointed at one last decision.',
    },
  ];

  const seasonEvents: NewspaperSeasonEvent[] = [...publicHeadlineEvents, ...fallbackEvents].slice(0, 4);

  const tabloidPages = seasonEvents.map((event, index) => {
    const subject = players.find((player) => player.name === event.subjectName) ?? null;
    const secondary = players.find((player) => player.name === event.secondaryName) ?? null;
    const secondaryFallback =
      secondary ?? (playerPool.length > 0 ? playerPool[(index + 1) % playerPool.length] : null);
    return createNewspaperFrontPage(event, index, {
      featuredImage: resolveTabloidImage(subject),
      featuredImageAlt: subject?.name ?? event.subjectName ?? 'Featured housemate',
      secondaryImage: resolveTabloidImage(secondaryFallback),
      secondaryImageAlt: secondary?.name ?? 'Housemate reaction',
      issueDate: `Week ${event.week} Recap`,
      issueNumber: `Finale File ${index + 1}`,
      edition: index % 2 === 0 ? 'Flashback Edition' : 'Late Feed Edition',
      headlineHighlight: event.subjectName ?? 'Season Recap',
      layoutVariant: index % 3 === 0 ? 'headline' : index % 3 === 1 ? 'collage' : 'hero',
    });
  });

  const tabloidNotes = beats.slice(0, 3).map((beat) => ({
    kicker: beat.kicker,
    line: beat.line,
  }));

  return { tabloidPages, tabloidNotes };
}

// ─── Scene frame wrapper ──────────────────────────────────────────────────────

function SceneFrame({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <motion.section
      className={['src-scene', className].filter(Boolean).join(' ')}
      style={style}
      initial={{ opacity: 0, scale: 1.04, filter: 'blur(18px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.985, filter: 'blur(12px)' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}

// ─── Intro scenes ─────────────────────────────────────────────────────────────

const INTRO_LINES: Record<string, { line: string; modifier: string }> = {
  intro_1: { line: 'The votes are in.', modifier: 'src-intro--1' },
  intro_2: { line: 'But before the final verdict\u2026', modifier: 'src-intro--2' },
  intro_3: { line: 'Let\u2019s rewind the chaos.', modifier: 'src-intro--3' },
};

function CinematicIntroScene({ sceneId }: { sceneId: string }) {
  const data = INTRO_LINES[sceneId];
  if (!data) return null;
  return (
    <SceneFrame className={`src-scene--intro ${data.modifier}`}>
      <div className="src-intro-card">
        <motion.p
          className="src-intro-line"
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {data.line}
        </motion.p>
        <div className="src-intro-rule" aria-hidden="true" />
      </div>
    </SceneFrame>
  );
}

// ─── Montage scene ────────────────────────────────────────────────────────────

function MontageScene({
  beats,
  tabloidPages,
  tabloidNotes,
  durationMs,
  reducedMotion,
}: {
  beats: RecapBeat[];
  tabloidPages: NewspaperFrontPageData[];
  tabloidNotes: FinaleMontageNote[];
  durationMs: number;
  reducedMotion: boolean;
}) {
  return (
    <SceneFrame className="src-scene--montage">
      <div className="src-montage-header">
        <span className="src-montage-tag">This season</span>
        <h2 className="src-montage-title">The papers could barely keep up.</h2>
      </div>
      <div className="src-montage-recap">
        <div className="src-montage-beat-stack" aria-label="Season story beats">
          {beats.map((beat, index) => (
            <motion.article
              key={beat.kicker}
              className="src-montage-beat"
              initial={{ opacity: 0, x: -24, y: 16 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.48, delay: 0.18 + index * 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className="src-montage-beat__kicker">{beat.kicker}</span>
              <p className="src-montage-beat__line">{beat.line}</p>
            </motion.article>
          ))}
        </div>
        <FinaleNewspaperMontage
          pages={tabloidPages}
          notes={tabloidNotes}
          durationMs={durationMs}
          reducedMotion={reducedMotion}
        />
      </div>
      <div className="src-montage-flash" aria-hidden="true" />
    </SceneFrame>
  );
}

// ─── Category reveal scene ────────────────────────────────────────────────────

function CategoryScene({ category }: { category: AwardCategory }) {
  const accentStyle: CatAccentStyle = {
    '--cat-accent': category.accentColor,
    '--cat-gradient': category.bgGradient,
  };

  return (
    <SceneFrame className="src-scene--category" style={accentStyle}>
      <div className="src-cat-header">
        <motion.span
          className="src-cat-emoji"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.1, type: 'spring', bounce: 0.5 }}
          aria-hidden="true"
        >
          {category.emoji}
        </motion.span>
        <motion.h2
          className="src-cat-name"
          initial={{ opacity: 0, x: -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.52, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {category.name}
        </motion.h2>
        <motion.p
          className="src-cat-subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.48 }}
        >
          {category.subtitle}
        </motion.p>
      </div>

      <motion.div
        className="src-cat-winner"
        initial={{ opacity: 0, y: 60, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.65, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="src-cat-winner__halo" aria-hidden="true" />
        <FullSizeCutoutImage
          player={category.winner}
          alt={category.winner.name}
          className="src-cat-winner__cutout"
          loading="eager"
        />
        <div className="src-cat-winner__info">
          <span className="src-cat-winner__name">{firstName(category.winner)}</span>
          <span className="src-cat-winner__stat">{category.winnerStat}</span>
        </div>
      </motion.div>
    </SceneFrame>
  );
}

// ─── Eviction ladder scene ────────────────────────────────────────────────────

const MAX_LADDER_DISPLAY = 8;

function EvictionLadderScene({
  players,
  durationMs,
}: {
  players: Player[];
  durationMs: number;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (players.length <= 1) return;
    const stepMs = Math.max(380, Math.floor(durationMs / players.length));
    const timer = setInterval(() => {
      setActiveIndex((current) => {
        if (current >= players.length - 1) return current;
        return current + 1;
      });
    }, stepMs);
    return () => clearInterval(timer);
  }, [durationMs, players.length]);

  const current = players[activeIndex] ?? players[0];
  // Use regular webp avatars for the ladder — full-body cutouts are reserved
  // for the category award reveals and the finale scene.
  const avatarSrc = current ? resolveAvatar(current) : null;

  return (
    <SceneFrame className="src-scene--ladder">
      <div className="src-ladder-header">
        <span className="src-scene-heading__eyebrow">Eviction Ladder</span>
        <h2 className="src-scene-heading__title">One by one, the season fell away.</h2>
      </div>
      <div className="src-ladder-stage">
        <AnimatePresence mode="wait">
          {current && avatarSrc && (
            <motion.div
              key={current.id}
              className="src-ladder-portrait"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              transition={{ duration: 0.35 }}
            >
              <img src={avatarSrc} alt={current.name} className="src-ladder-portrait__img" />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="src-ladder-list">
          {players.slice(0, MAX_LADDER_DISPLAY).map((player, index) => {
            const placement = getPlacementValue(player) ?? players.length - index;
            return (
              <div
                key={player.id}
                className={`src-ladder-row${index === activeIndex ? ' src-ladder-row--active' : ''}`}
              >
                <span className="src-ladder-row__placement">{placementLabel(placement)}</span>
                <span className="src-ladder-row__name">{player.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </SceneFrame>
  );
}

// ─── Finale (outro) scene ─────────────────────────────────────────────────────

function FinaleScene({ finalists }: { finalists: Player[] }) {
  return (
    <SceneFrame className="src-scene--finale">
      <div className="src-finale-copy">
        <motion.p
          className="src-finale-copy__lead"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          And now\u2026
        </motion.p>
        <motion.h2
          className="src-finale-copy__title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          the final verdict.
        </motion.h2>
      </div>
      <div className="src-finalists-band">
        {finalists.map((finalist, i) => (
          <motion.div
            key={finalist.id}
            className="src-finalist-portrait"
            initial={{ opacity: 0, y: 40, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.7 + i * 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <FullSizeCutoutImage
              player={finalist}
              alt={finalist.name}
              className="src-finalist-portrait__img"
            />
            <span className="src-finalist-portrait__name">{finalist.name}</span>
          </motion.div>
        ))}
      </div>
    </SceneFrame>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SeasonRecapCinematic({
  // `season` is accepted for the component API but not currently displayed
  // (the intro cards are the first thing on screen, not a season badge).
  season: _season,
  week,
  players,
  publicOpinion,
  onComplete,
}: SeasonRecapProps) {
  const prefersReducedMotion = useReducedMotion();
  const noAnimations =
    typeof document !== 'undefined' && document.body.classList.contains('no-animations');
  const reducedMotion = prefersReducedMotion || noAnimations;

  const recapData = useMemo(
    () => buildRecapData(players, week, publicOpinion),
    [players, publicOpinion, week],
  );

  const timings = useMemo(() => {
    const base = buildSceneTimings(recapData.categories.length);
    return reducedMotion
      ? base.map((scene) => ({ ...scene, durationMs: Math.min(scene.durationMs, 250) }))
      : base;
  }, [reducedMotion, recapData.categories.length]);

  const [sceneIndex, setSceneIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const didFinishRef = useRef(false);
  const finishTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (finishTimeoutRef.current != null) {
        window.clearTimeout(finishTimeoutRef.current);
      }
    },
    [],
  );

  const finish = useCallback(() => {
    if (didFinishRef.current) return;
    didFinishRef.current = true;
    setVisible(false);
    finishTimeoutRef.current = window.setTimeout(
      () => onComplete(),
      reducedMotion ? 0 : RECAP_EXIT_FADE_MS,
    );
  }, [onComplete, reducedMotion]);

  useEffect(() => {
    if (sceneIndex >= timings.length) {
      const timer = setTimeout(() => finish(), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => {
      setSceneIndex((current) => current + 1);
    }, timings[sceneIndex].durationMs);
    return () => clearTimeout(timer);
  }, [finish, sceneIndex, timings]);

  const currentScene = timings[sceneIndex];

  return (
    <motion.div
      className="src-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Season recap cinematic"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.4 }}
    >
      <div className="src-vignette" aria-hidden="true" />
      <div className="src-spotlight-cone src-spotlight-cone--left" aria-hidden="true" />
      <div className="src-spotlight-cone src-spotlight-cone--right" aria-hidden="true" />
      <div className="src-particles" aria-hidden="true">
        {Array.from({ length: 22 }).map((_, index) => (
          <span key={index} className={`src-particle src-particle--${(index % 6) + 1}`} />
        ))}
      </div>

      {visible && (
        <button
          type="button"
          className="src-skip-btn"
          onClick={() => finish()}
          aria-label="Skip recap"
        >
          Skip
        </button>
      )}

      <AnimatePresence mode="wait">
        {/* Dramatic intro cards */}
        {(currentScene?.id === 'intro_1' ||
          currentScene?.id === 'intro_2' ||
          currentScene?.id === 'intro_3') && (
          <CinematicIntroScene key={currentScene.id} sceneId={currentScene.id} />
        )}

        {/* Season montage burst */}
        {currentScene?.id === 'montage' && (
          <MontageScene
            key="montage"
            beats={recapData.dramaBeats}
            tabloidPages={recapData.tabloidPages}
            tabloidNotes={recapData.tabloidNotes}
            durationMs={currentScene.durationMs}
            reducedMotion={reducedMotion}
          />
        )}

        {/* Category award reveals */}
        {currentScene?.id?.startsWith('cat_') &&
          (() => {
            const catIdx = parseInt(currentScene.id.replace('cat_', ''), 10);
            const cat = recapData.categories[catIdx];
            return cat ? <CategoryScene key={currentScene.id} category={cat} /> : null;
          })()}

        {/* Eviction ladder */}
        {currentScene?.id === 'ladder' && (
          <EvictionLadderScene
            key="ladder"
            players={recapData.evictionLadder}
            durationMs={currentScene.durationMs}
          />
        )}

        {/* Cinematic outro — "And now… the final verdict." */}
        {currentScene?.id === 'finale' && (
          <FinaleScene key="finale" finalists={recapData.finalists} />
        )}
      </AnimatePresence>

      {/* Secondary CTA shown during the finale scene for easy advancement */}
      {currentScene?.id === 'finale' && visible && (
        <button
          type="button"
          className="src-skip-btn src-skip-btn--finish"
          onClick={() => finish()}
          aria-label="Finish recap"
        >
          Continue
        </button>
      )}
    </motion.div>
  );
}
