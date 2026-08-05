import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { GameHistoryEvent, Player } from '../../types';
import type { PublicOpinionState } from '../../publicOpinion/types';
import FullSizeCutoutImage from '../FullSizeCutoutImage/FullSizeCutoutImage';
import PlayerAvatar from '../PlayerAvatar/PlayerAvatar';
import {
  buildSeasonRecapData,
  type AwardCategory,
  type RecapData,
} from './seasonRecapData';
import './SeasonRecapCinematic.css';

export interface SeasonRecapProps {
  season: number;
  week: number;
  players: Player[];
  history?: GameHistoryEvent[];
  publicOpinion?: PublicOpinionState | null;
  onComplete: () => void;
}

const BASE = import.meta.env.BASE_URL.endsWith('/')
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
const INTRO_DURATION_MS = 2_200;
const AUTO_CHAPTER_DURATION_MS = 1_650;
const EXIT_FADE_MS = 360;
// Bea's legacy formal PNG is a near-black silhouette, so keep the award reveal legible
// until it is replaced with a usable formal cutout.
const FORMAL_CUTOUT_FALLBACK_IDS = new Set(['bea']);

const PHOTOSET = [
  {
    title: 'The Girls',
    eyebrow: 'Final photoshoot · Side A',
    caption: 'The house left the cameras one last sharp frame.',
    imageSrc: `${BASE}assets/skins/thegirls.webp`,
  },
  {
    title: 'The Boys',
    eyebrow: 'Final photoshoot · Side B',
    caption: 'The last looks, without a single eviction chair in sight.',
    imageSrc: `${BASE}assets/skins/the%20boys.webp`,
  },
] as const;

const HIDDEN_MOMENTS = [
  {
    title: 'The pancake incident',
    eyebrow: 'Unseen footage · Kitchen cam',
    caption: 'One flip. Three suspects. Flour absolutely everywhere.',
    stamp: '02:13 AM',
    imageSrc: `${BASE}assets/season-recap-moments/kitchen-pancake-chaos.webp`,
  },
  {
    title: 'Key, set, chaos',
    eyebrow: 'Challenge replay · Backyard',
    caption: 'The golden key was easy. Staying upright was not.',
    stamp: 'Week 07',
    imageSrc: `${BASE}assets/season-recap-moments/backyard-key-slide.webp`,
  },
  {
    title: 'Operation: midnight cake',
    eyebrow: 'Secret mission · Living room',
    caption: 'A flawless plan, if nobody looked at the enormous cake.',
    stamp: 'Classified',
    imageSrc: `${BASE}assets/season-recap-moments/midnight-cake-mission.webp`,
  },
] as const;

const AUTOMATIC_INTRO_SLIDES = [
  ...PHOTOSET.map((item) => ({ ...item, chapter: '01', chapterLabel: 'The final photoshoot' })),
  ...HIDDEN_MOMENTS.map((item) => ({ ...item, chapter: '02', chapterLabel: 'Hidden moments' })),
];

type RecapView = 'intro' | 'automatic-intro' | 'hub' | 'awards' | 'honor' | 'journey';

interface TimelineCheckpoint {
  id: string;
  day: number;
  player?: Player;
  players?: Player[];
  kind: 'eviction' | 'milestone' | 'twist' | 'finale';
  title: string;
  label: string;
  detail: string;
}

const CALENDAR_EVENT_META: Record<TimelineCheckpoint['kind'], { icon: string; name: string; label: string }> = {
  eviction: { icon: '●', name: 'Exit', label: 'Exit night' },
  twist: { icon: '✦', name: 'Twist', label: 'Shock night' },
  milestone: { icon: '◇', name: 'Milestone', label: 'Season turn' },
  finale: { icon: '✺', name: 'Finale', label: 'Finale night' },
};

function getMajorEventImpact(event: TimelineCheckpoint): string | null {
  if (event.kind === 'twist') {
    return 'The expected elimination order broke here, reshaping the endgame.';
  }
  if (event.kind === 'milestone') {
    return 'Every vote after this point helped decide the eventual winner.';
  }
  if (event.kind === 'finale') {
    return 'The final two entered the season’s closing decision.';
  }
  return null;
}

function RecapIntro({
  onSkip,
  season,
}: {
  onSkip: () => void;
  season: number;
}) {
  return (
    <motion.section
      className="src-explore-intro"
      initial={{ opacity: 0, scale: 1.025 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="src-explore-intro__wash" aria-hidden="true" />
      <button className="src-explore-intro__skip" type="button" onClick={onSkip}>
        Skip opening
      </button>
      <div className="src-explore-intro__copy">
        <motion.p
          className="src-explore-kicker"
          initial={{ opacity: 0, y: 9 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
        >
          Season {season} · Final archive
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.66, ease: [0.22, 1, 0.36, 1] }}
        >
          They left<br />their mark.
        </motion.h1>
        <motion.p
          className="src-explore-intro__body"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.72 }}
        >
          A short final look before the ceremony begins.
        </motion.p>
      </div>
    </motion.section>
  );
}

function AutomaticIntroduction({
  onComplete,
  reducedMotion,
}: {
  onComplete: () => void;
  reducedMotion: boolean;
}) {
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = AUTOMATIC_INTRO_SLIDES[slideIndex] ?? AUTOMATIC_INTRO_SLIDES[0];

  useEffect(() => {
    const isLastSlide = slideIndex >= AUTOMATIC_INTRO_SLIDES.length - 1;
    const timeout = window.setTimeout(
      () => {
        if (isLastSlide) onComplete();
        else setSlideIndex((current) => current + 1);
      },
      reducedMotion ? 0 : AUTO_CHAPTER_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [onComplete, reducedMotion, slideIndex]);

  return (
    <motion.section
      className="src-auto-intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button className="src-auto-intro__skip" type="button" onClick={onComplete}>
        Skip to the archive
      </button>
      <div className="src-auto-intro__progress" aria-label={`Opening segment ${slideIndex + 1} of ${AUTOMATIC_INTRO_SLIDES.length}`}>
        {AUTOMATIC_INTRO_SLIDES.map((item, index) => (
          <span key={`${item.chapter}-${item.title}`} data-active={index <= slideIndex ? 'true' : 'false'} />
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.article
          key={`${slide.chapter}-${slide.title}`}
          className="src-auto-intro__slide"
          initial={{ opacity: 0, scale: 1.035 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.99 }}
          transition={{ duration: reducedMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          <img src={slide.imageSrc} alt="" aria-hidden="true" />
          <div className="src-auto-intro__shade" aria-hidden="true" />
          <div className="src-auto-intro__copy">
            <p className="src-explore-kicker">{slide.chapter} · {slide.chapterLabel}</p>
            <h1>{slide.title}</h1>
            <p>{slide.caption}</p>
            {'stamp' in slide && <span>{slide.stamp}</span>}
          </div>
        </motion.article>
      </AnimatePresence>
    </motion.section>
  );
}

function RecapHub({
  categoryCount,
  onOpenAwards,
  onOpenJourney,
}: {
  categoryCount: number;
  onOpenAwards: () => void;
  onOpenJourney: () => void;
}) {
  return (
    <motion.section
      className="src-recap-hub"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="src-recap-hub__light" aria-hidden="true" />
      <header className="src-recap-hub__heading">
        <p className="src-explore-kicker">The final archive</p>
        <h1>Choose the next chapter.</h1>
        <p>The recap music keeps playing while you explore.</p>
      </header>
      <div className="src-recap-hub__prologue" aria-label="Opening chapters completed">
        <span><b>01</b><small>Final photoshoot</small><i>Played</i></span>
        <span><b>02</b><small>Hidden moments</small><i>Played</i></span>
      </div>
      <div className="src-recap-hub__choices">
        <motion.button
          className="src-recap-hub__awards"
          type="button"
          onClick={onOpenAwards}
          whileTap={{ scale: 0.98 }}
        >
          <span className="src-recap-hub__number">03</span>
          <span className="src-recap-hub__eyebrow">Awards ceremony</span>
          <strong>Season honors.</strong>
          <small>{categoryCount} categories. One final spotlight for each result.</small>
          <em>Enter ceremony →</em>
        </motion.button>
        <motion.button
          className="src-recap-hub__journey"
          type="button"
          onClick={onOpenJourney}
          whileTap={{ scale: 0.98 }}
        >
          <span className="src-recap-hub__number">04</span>
          <span className="src-recap-hub__eyebrow">Season calendar</span>
          <strong>The road to the finale.</strong>
          <small>Open the meaningful days, exits, twists, and final result.</small>
          <em>Open calendar →</em>
        </motion.button>
      </div>
    </motion.section>
  );
}

function AwardsList({
  categories,
  onBack,
  onSelect,
}: {
  categories: AwardCategory[];
  onBack: () => void;
  onSelect: (index: number) => void;
}) {
  return (
    <motion.section
      className="src-awards"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button className="src-explore-back" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> Archive
      </button>
      <header className="src-awards__heading">
        <p className="src-explore-kicker">03 · Awards ceremony</p>
        <h1>The season honors.</h1>
        <p>Choose a category to reveal its winner and official result.</p>
      </header>
      <div className="src-awards__list" role="list" aria-label="Season honor categories">
        {categories.map((category, index) => (
          <motion.div key={category.id} role="listitem">
            <motion.button
              className="src-awards__item"
              type="button"
              onClick={() => onSelect(index)}
              whileTap={{ scale: 0.985 }}
            >
              <span className="src-awards__emoji" aria-hidden="true">{category.emoji}</span>
              <span className="src-awards__item-copy">
                <strong>{category.name}</strong>
                <small>{category.subtitle}</small>
              </span>
              <span className="src-awards__open" aria-hidden="true">↗</span>
            </motion.button>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

function HonorDetail({ category }: { category: AwardCategory }) {
  const usesInformalFallback = FORMAL_CUTOUT_FALLBACK_IDS.has(category.winner.id.toLowerCase());

  return (
    <div
      className="src-explore-honor"
      style={{
        '--src-accent': category.accentColor,
        '--src-glow': category.accentGlow,
        '--src-honor-bg': category.bgGradient,
      } as CSSProperties}
    >
      <div className="src-explore-honor__backdrop" aria-hidden="true" />
      <motion.div
        className="src-explore-honor__person"
        initial={{ opacity: 0, x: -24, y: 18 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="src-explore-honor__halo" aria-hidden="true" />
        <FullSizeCutoutImage
          player={category.winner}
          attire={usesInformalFallback ? 'informal' : 'formal'}
          alt={category.winner.name}
          className={`src-explore-honor__cutout${usesInformalFallback ? ' src-explore-honor__cutout--fallback' : ''}`}
          loading="eager"
        />
      </motion.div>
      <motion.article
        className="src-explore-honor__copy"
        initial={{ opacity: 0, x: 22 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.56, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="src-explore-honor__emoji" aria-hidden="true">{category.emoji}</span>
        <p className="src-explore-kicker">Official result</p>
        <h1>{category.name}</h1>
        <p>{category.subtitle}</p>
        <div className="src-explore-honor__winner">
          <span>Awarded to</span>
          <strong>{category.winner.name}</strong>
          <small>{category.winnerStat}</small>
        </div>
      </motion.article>
    </div>
  );
}

function getSeasonDayCount(recapData: RecapData, week: number): number {
  const latestRecordedExit = recapData.evictionLadder.reduce(
    (latest, player) => Math.max(latest, player.evictedAtWeek ?? 0),
    0,
  );

  return Math.max(1, Math.round(week), latestRecordedExit);
}

function buildTimelineCheckpoints(recapData: RecapData, week: number): TimelineCheckpoint[] {
  const totalDays = getSeasonDayCount(recapData, week);
  const latestPreFinaleDay = Math.max(1, totalDays - 1);
  // A runner-up is announced beside the champion, not archived as an exit.
  // The Final 3 public verdict gets its own bronze-medalist moment instead of
  // being mistaken for a double elimination when it shares finale night.
  const evictions = recapData.evictionLadder.filter(
    (player) => player.seasonPlacement !== 2 && player.finalRank !== 2,
  );
  const checkpoints = evictions.map((player, index) => {
    const inferredDay = Math.round(((index + 1) / (evictions.length + 1)) * totalDays);
    const day = Math.max(1, Math.min(latestPreFinaleDay, player.evictedAtWeek ?? inferredDay));
    const isBronzeMedalist = player.seasonPlacement === 3 || player.finalRank === 3;
    return {
      id: `eviction-${player.id}-${index}`,
      day,
      player,
      kind: isBronzeMedalist ? 'milestone' as const : 'eviction' as const,
      title: player.name,
      label: isBronzeMedalist ? 'Bronze medalist' : 'Exit',
      detail: isBronzeMedalist
        ? `${player.name} finished third after the final public verdict.`
        : `${player.name}'s season ended here.`,
    };
  });
  const knownTwists: TimelineCheckpoint[] = [];
  const evictionsByDay = new Map<number, TimelineCheckpoint[]>();
  checkpoints.filter((checkpoint) => checkpoint.kind === 'eviction').forEach((checkpoint) => {
    const entries = evictionsByDay.get(checkpoint.day) ?? [];
    entries.push(checkpoint);
    evictionsByDay.set(checkpoint.day, entries);
  });
  evictionsByDay.forEach((entries, day) => {
    if (entries.length < 2) return;
    const names = entries.map((entry) => entry.player?.name).filter(Boolean) as string[];
    const nameList = names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
    knownTwists.push({
      id: `twist-eviction-${day}`,
      day,
      kind: 'twist',
      title: entries.length === 2 ? 'Double elimination' : 'Triple elimination',
      label: 'Elimination night',
      detail: `${nameList} were eliminated on the same night, changing the shape of the endgame.`,
    });
  });
  if (totalDays >= 6) {
    const midpointDay = Math.max(2, Math.round(totalDays / 2) - 1);
    knownTwists.push({
      id: `milestone-midseason-${midpointDay}`,
      day: midpointDay,
      kind: 'milestone',
      title: 'Midseason turn',
      label: 'Milestone',
      detail: 'The season crossed into its decisive second half.',
    });
  }
  evictions.filter((player) => (player.stats?.battleBackWins ?? 0) > 0).forEach((player, index) => {
    const departure = checkpoints.find((checkpoint) => checkpoint.player?.id === player.id);
    knownTwists.push({
      id: `twist-battle-back-${player.id}`,
      day: Math.min(latestPreFinaleDay, (departure?.day ?? Math.round(totalDays / 2)) + index + 2),
      player,
      kind: 'twist',
      title: 'Battle back',
      label: 'Twist night',
      detail: `${player.name} fought their way back into the story.`,
    });
  });
  const finalists = [...recapData.finalists]
    .slice(0, 2)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const fallbackFinalist = finalists[0] ?? evictions.at(-1);

  if (!fallbackFinalist) return [...checkpoints, ...knownTwists].sort((a, b) => a.day - b.day);

  return [
    ...checkpoints,
    ...knownTwists,
    {
      id: `finale-${finalists.map((player) => player.id).join('-') || fallbackFinalist.id}`,
      day: totalDays,
      players: finalists.length > 0 ? finalists : [fallbackFinalist],
      kind: 'finale' as const,
      title: 'Finale',
      label: 'Finale',
      detail: finalists.length === 2
        ? `${finalists[0].name} and ${finalists[1].name} entered the final decision.`
        : 'The season reached its final decision.',
    },
  ].sort((a, b) => a.day - b.day || (a.kind === 'twist' ? -1 : 1));
}

function FinaleCalendarFocus({
  day,
  events,
  history,
  allPlayers,
  onClose,
}: {
  day: number;
  events: TimelineCheckpoint[];
  history: GameHistoryEvent[];
  allPlayers: Player[];
  onClose: () => void;
}) {
  const leadEvent = events.find((event) => event.kind === 'twist')
    ?? events.find((event) => event.kind === 'milestone')
    ?? events.find((event) => event.kind === 'finale')
    ?? events[0];

  if (!leadEvent) return null;

  const player = leadEvent.player;
  const placement = player?.isWinner || player?.finalRank === 1
    ? '#1'
    : player?.seasonPlacement
      ? `#${player.seasonPlacement}`
      : player?.finalRank
        ? `#${player.finalRank}`
        : '—';
  const impact = getMajorEventImpact(leadEvent);
  const involvedPlayers = [...new Map(
    events
      .flatMap((event) => [
        ...(event.players ?? []),
        ...(event.player ? [event.player] : []),
      ])
      .map((eventPlayer) => [eventPlayer.id, eventPlayer] as const),
  ).values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const exitRecords = history.filter((event) => event.type === 'seasonExit');
  const exitRecord = player
    ? [...exitRecords].reverse().find((event: GameHistoryEvent) => event.data.playerId === player.id)
    : undefined;
  const exitData = exitRecord?.data;
  const leaderIds = Array.isArray(exitData?.leaderIds)
    ? exitData.leaderIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];
  const leaderNames = leaderIds
    .map((id) => allPlayers.find((candidate) => candidate.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const decisionMakerId = typeof exitData?.decisionMakerId === 'string'
    ? exitData.decisionMakerId
    : null;
  const decisionMakerName = decisionMakerId
    ? allPlayers.find((candidate) => candidate.id === decisionMakerId)?.name
    : null;
  const voteCounts = exitData?.voteCounts && typeof exitData.voteCounts === 'object'
    ? exitData.voteCounts as Record<string, unknown>
    : {};
  const recordedVoteTotal = Object.values(voteCounts).reduce<number>(
    (total, count) => total + (typeof count === 'number' ? count : 0),
    0,
  );
  const isVoxExit =
    exitData?.voxPopuli === true ||
    (
      leaderIds.length === 0 &&
      decisionMakerId == null &&
      recordedVoteTotal >= 99.5 &&
      recordedVoteTotal <= 100.5
    );
  const nominationVoteCounts =
    exitData?.nominationVoteCounts && typeof exitData.nominationVoteCounts === 'object'
      ? exitData.nominationVoteCounts as Record<string, unknown>
      : {};
  const publicVotePercentages =
    exitData?.publicVotePercentages && typeof exitData.publicVotePercentages === 'object'
      ? exitData.publicVotePercentages as Record<string, unknown>
      : voteCounts;
  const exitNomineeIds = Array.isArray(exitData?.nomineeIds)
    ? exitData.nomineeIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];
  const otherNomineeNames = player
    ? exitNomineeIds
        .filter((id) => id !== player.id)
        .map((id) => allPlayers.find((candidate) => candidate.id === id)?.name)
        .filter((name): name is string => Boolean(name))
    : [];
  const nominationVotes =
    player && typeof nominationVoteCounts[player.id] === 'number'
      ? nominationVoteCounts[player.id] as number
      : 0;
  const publicVotePercent =
    player && typeof publicVotePercentages[player.id] === 'number'
      ? publicVotePercentages[player.id] as number
      : null;
  const automaticNomineeId =
    typeof exitData?.automaticNomineeId === 'string' ? exitData.automaticNomineeId : null;
  const voxPunchLines = [
    'The audience had the final word.',
    'The spotlight narrowed, and the public closed this chapter.',
    'One public verdict changed the shape of the house.',
  ];
  const voxPunchLine = player
    ? voxPunchLines[(day + player.id.length) % voxPunchLines.length]
    : voxPunchLines[0];
  const voxNominationStory = player
    ? Object.keys(nominationVoteCounts).length === 0
      ? `${player.name} was nominated on Day ${day} before facing the audience.`
      : player.id === automaticNomineeId
      ? `${player.name} finished last in the Day ${day} immunity competition and went onto the block${otherNomineeNames.length > 0 ? ` alongside ${otherNomineeNames.join(' and ')}` : ''}.`
      : `${player.name} was nominated on Day ${day} with ${nominationVotes} secret nomination vote${nominationVotes === 1 ? '' : 's'}${otherNomineeNames.length > 0 ? `, alongside ${otherNomineeNames.join(' and ')}` : ''}.`
    : null;
  const voxEliminationStory =
    player && publicVotePercent != null
      ? `${player.name} was eliminated with ${publicVotePercent.toFixed(1)}% of the audience vote.`
      : null;
  const votesAgainst = player && typeof voteCounts[player.id] === 'number'
    ? voteCounts[player.id] as number
    : null;
  const totalBallots = Object.values(voteCounts).reduce<number>(
    (total, count) => total + (typeof count === 'number' ? count : 0),
    0,
  );
  const helpedEliminateIds = player
    ? exitRecords.flatMap((record) => {
        const eliminatedId = typeof record.data.playerId === 'string' ? record.data.playerId : null;
        const votes = record.data.votesByVoterId && typeof record.data.votesByVoterId === 'object'
          ? record.data.votesByVoterId as Record<string, unknown>
          : {};
        return eliminatedId && votes[player.id] === eliminatedId ? [eliminatedId] : [];
      })
    : [];
  const controlledExitIds = player
    ? exitRecords.flatMap((record) => {
        const eliminatedId = typeof record.data.playerId === 'string' ? record.data.playerId : null;
        const recordLeaderIds = Array.isArray(record.data.leaderIds) ? record.data.leaderIds : [];
        return eliminatedId && recordLeaderIds.includes(player.id) ? [eliminatedId] : [];
      })
    : [];
  const namesForIds = (ids: string[]) => [...new Set(ids)]
    .map((id) => allPlayers.find((candidate) => candidate.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const helpedEliminateNames = namesForIds(helpedEliminateIds);
  const controlledExitNames = namesForIds(controlledExitIds);
  const groupedEliminationFacts = !player && leadEvent.kind === 'twist'
    ? involvedPlayers.map((involvedPlayer) => {
        const record = [...exitRecords]
          .reverse()
          .find((event: GameHistoryEvent) => event.data.playerId === involvedPlayer.id);
        const data = record?.data;
        const nominationCounts =
          data?.nominationVoteCounts && typeof data.nominationVoteCounts === 'object'
            ? data.nominationVoteCounts as Record<string, unknown>
            : {};
        const percentages =
          data?.publicVotePercentages && typeof data.publicVotePercentages === 'object'
            ? data.publicVotePercentages as Record<string, unknown>
            : {};
        const nomineeIds = Array.isArray(data?.nomineeIds)
          ? data.nomineeIds.filter((id: unknown): id is string => typeof id === 'string')
          : [];
        const companions = nomineeIds
          .filter((id) => id !== involvedPlayer.id)
          .map((id) => allPlayers.find((candidate) => candidate.id === id)?.name)
          .filter((name): name is string => Boolean(name));
        const nominationCount =
          typeof nominationCounts[involvedPlayer.id] === 'number'
            ? nominationCounts[involvedPlayer.id] as number
            : null;
        const publicPercent =
          typeof percentages[involvedPlayer.id] === 'number'
            ? percentages[involvedPlayer.id] as number
            : null;
        const nominationLine = nominationCount != null
          ? `${involvedPlayer.name} was nominated on Day ${day} with ${nominationCount} vote${nominationCount === 1 ? '' : 's'}${companions.length > 0 ? ` alongside ${companions.join(' and ')}` : ''}.`
          : `${involvedPlayer.name} entered the elimination vote on Day ${day}${companions.length > 0 ? ` alongside ${companions.join(' and ')}` : ''}.`;
        const resultLine = publicPercent != null
          ? ` ${involvedPlayer.name} was eliminated with ${publicPercent.toFixed(1)}% of the audience vote.`
          : ' Their exit was confirmed during the same live elimination.';
        return {
          label: involvedPlayer.name,
          value: `${nominationLine}${resultLine}`,
        };
      })
    : [];
  const finaleFacts = player && leadEvent.kind === 'finale'
    ? [
        {
          label: 'Final result',
          value: player.isWinner || player.finalRank === 1
            ? `${player.name} was crowned the season winner after the final audience decision.`
            : `${player.name} reached the Final 2 and finished ${placement}.`,
        },
        {
          label: 'Season record',
          value: `${player.name} won ${player.stats?.lohWins ?? 0} immunity competition${(player.stats?.lohWins ?? 0) === 1 ? '' : 's'}, ${player.stats?.posWins ?? 0} Safety competition${(player.stats?.posWins ?? 0) === 1 ? '' : 's'}, and faced nomination ${player.stats?.timesNominated ?? 0} time${(player.stats?.timesNominated ?? 0) === 1 ? '' : 's'}.`,
        },
        {
          label: 'The last word',
          value: 'The audience closed the season and completed the final finishing order.',
        },
      ]
    : [];
  const storyFacts = player
    ? isVoxExit
      ? [
          voxNominationStory
            ? { label: 'Nomination', value: voxNominationStory }
            : null,
          voxEliminationStory
            ? { label: 'Public verdict', value: voxEliminationStory }
            : null,
          { label: 'The moment', value: voxPunchLine },
        ].filter((fact): fact is { label: string; value: string } => Boolean(fact))
      : leadEvent.kind === 'finale'
        ? finaleFacts
        : [
          decisionMakerName
            ? { label: 'Exit decision', value: `${decisionMakerName} made the direct decision to eliminate ${player.name}.` }
            : leaderNames.length > 0
              ? { label: 'Round control', value: `${player.name} was eliminated during ${leaderNames.join(' & ')}'s leadership.` }
              : null,
          votesAgainst != null && totalBallots > 0
            ? { label: 'Final ballot', value: `${votesAgainst} of ${totalBallots} recorded votes were cast against ${player.name}.` }
            : null,
          controlledExitNames.length > 0
            ? { label: 'Power moves', value: `${player.name}'s leadership rounds ended ${controlledExitNames.join(', ')}'s run${controlledExitNames.length === 1 ? '' : 's'}.` }
            : null,
          helpedEliminateNames.length > 0
            ? { label: 'Direct impact', value: `${player.name}'s recorded votes helped eliminate ${helpedEliminateNames.join(', ')}.` }
            : null,
        ].filter((fact): fact is { label: string; value: string } => Boolean(fact))
    : groupedEliminationFacts;

  return (
    <motion.article
      className="src-finale-calendar__focus-card"
      data-kind={leadEvent.kind}
      layoutId={`finale-day-${day}`}
      initial={{ opacity: 0, scale: 0.88, rotateX: -8 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      exit={{ opacity: 0, scale: 0.9, rotateX: 6 }}
      transition={{ type: 'spring', stiffness: 245, damping: 27 }}
    >
      <button className="src-finale-calendar__focus-close" type="button" onClick={onClose}>
        <span aria-hidden="true">←</span> Calendar
      </button>
      <div className="src-finale-calendar__focus-identity">
        <div className="src-finale-calendar__focus-portrait">
          {player ? (
            <PlayerAvatar player={player} size="lg" showEvictedStyle={false} showRelationshipOutline={false} />
          ) : (
            <span aria-hidden="true">{CALENDAR_EVENT_META[leadEvent.kind].icon}</span>
          )}
        </div>
        <div>
          <p>Day {day} · {leadEvent.label}</p>
          <h2>{leadEvent.kind === 'eviction' && player ? player.name : leadEvent.title}</h2>
          <span>{isVoxExit ? voxPunchLine : leadEvent.detail}{player && placement !== '—' ? ` Finished ${placement}.` : ''}</span>
        </div>
      </div>
      {storyFacts.length > 0 && (
        <dl className="src-finale-calendar__focus-story">
          {storyFacts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!player && involvedPlayers.length > 0 && (
        <div className="src-finale-calendar__focus-cast">
          <p>Players involved</p>
          <div>
            {involvedPlayers.map((involvedPlayer) => (
              <span key={involvedPlayer.id}>
                <PlayerAvatar player={involvedPlayer} size="sm" showEvictedStyle={false} showRelationshipOutline={false} />
                <small>{involvedPlayer.name}</small>
              </span>
            ))}
          </div>
        </div>
      )}
      {impact && (
        <p className="src-finale-calendar__focus-impact">
          <strong>Why it mattered</strong>
          {impact}
        </p>
      )}
    </motion.article>
  );
}

function FinaleTimeline({
  recapData,
  week,
  history,
  onBack,
}: {
  recapData: RecapData;
  week: number;
  history: GameHistoryEvent[];
  onBack: () => void;
}) {
  const checkpoints = useMemo(() => buildTimelineCheckpoints(recapData, week), [recapData, week]);
  const totalDays = getSeasonDayCount(recapData, week);
  const windowSize = 28;
  const calendarWindows = Array.from({ length: Math.ceil(totalDays / windowSize) }, (_, index) => {
    const start = index * windowSize + 1;
    return { start, end: Math.min(totalDays, start + windowSize - 1) };
  });
  const [windowIndex, setWindowIndex] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const activeWindow = calendarWindows[windowIndex] ?? calendarWindows[0];
  const eventsByDay = useMemo(() => {
    const entries = new Map<number, TimelineCheckpoint[]>();
    checkpoints.forEach((checkpoint) => {
      const events = entries.get(checkpoint.day) ?? [];
      events.push(checkpoint);
      entries.set(checkpoint.day, events);
    });
    return entries;
  }, [checkpoints]);
  const selectedEvents = selectedDay == null ? [] : eventsByDay.get(selectedDay) ?? [];
  const calendarDays = activeWindow
    ? Array.from({ length: activeWindow.end - activeWindow.start + 1 }, (_, index) => activeWindow.start + index)
    : [];
  const activeEventDays = calendarDays.filter((day) => (eventsByDay.get(day)?.length ?? 0) > 0).length;
  const rangeLabel = calendarWindows.length === 1
    ? `${totalDays}-day season`
    : `Days ${activeWindow?.start ?? 1}–${activeWindow?.end ?? totalDays}`;
  const daysPerTimelineRow = 4;
  const calendarRows = Array.from(
    { length: Math.ceil(calendarDays.length / daysPerTimelineRow) },
    (_, rowIndex) => calendarDays.slice(
      rowIndex * daysPerTimelineRow,
      (rowIndex + 1) * daysPerTimelineRow,
    ),
  );

  const selectWindow = (index: number) => {
    setWindowIndex(index);
    setSelectedDay(null);
  };

  return (
    <motion.section
      className="src-finale-calendar"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button className="src-explore-back" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> Archive
      </button>
      <header className="src-finale-calendar__heading">
        <p className="src-explore-kicker">Finale archive</p>
        <h1>The season, day by day.</h1>
        <p>A living record of exits, shocks, and the final crown.</p>
      </header>
      {calendarWindows.length > 1 && (
        <div
          className="src-finale-calendar__tabs"
          role="tablist"
          aria-label="Season calendar ranges"
          style={{ '--src-calendar-window-count': calendarWindows.length } as CSSProperties}
        >
          {calendarWindows.map((calendarWindow, index) => (
            <button
              key={calendarWindow.start}
              type="button"
              role="tab"
              aria-selected={index === windowIndex}
              onClick={() => selectWindow(index)}
            >
              Days {calendarWindow.start}–{calendarWindow.end}
            </button>
          ))}
        </div>
      )}
      <div className="src-finale-calendar__stage" data-mode={selectedEvents.length > 0 ? 'focus' : 'calendar'}>
        <AnimatePresence initial={false} mode="popLayout">
          {selectedEvents.length > 0 && selectedDay != null ? (
            <FinaleCalendarFocus
              key={`focus-${selectedDay}`}
              day={selectedDay}
              events={selectedEvents}
              history={history}
              allPlayers={[...recapData.evictionLadder, ...recapData.finalists]}
              onClose={() => setSelectedDay(null)}
            />
          ) : (
            <motion.div
              key={`calendar-${windowIndex}`}
              className="src-finale-calendar__calendar-view"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.035, filter: 'blur(4px)' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="src-finale-calendar__summary" aria-label={`${rangeLabel}: ${activeEventDays} event days`}>
                <span>{rangeLabel}</span>
                <strong>{activeEventDays} moments saved</strong>
              </div>
              <div className="src-finale-calendar__legend" aria-label="Event legend">
                {(Object.keys(CALENDAR_EVENT_META) as TimelineCheckpoint['kind'][]).map((kind) => {
                  const meta = CALENDAR_EVENT_META[kind];
                  return <span key={kind} data-kind={kind}><i aria-hidden="true">{meta.icon}</i>{meta.name}</span>;
                })}
              </div>
              <div
                className="src-finale-calendar__timeline"
                aria-label={`Season days ${activeWindow?.start ?? 1} to ${activeWindow?.end ?? totalDays}`}
                style={{ '--src-timeline-row-count': calendarRows.length } as CSSProperties}
              >
                <div className="src-finale-calendar__timeline-label">
                  <span>Day 01</span>
                  <strong>Season route</strong>
                  <span>Finale {String(totalDays).padStart(2, '0')}</span>
                </div>
                {calendarRows.map((rowDays, rowIndex) => (
                  <div
                    className="src-finale-calendar__timeline-row"
                    data-direction={rowIndex % 2 === 0 ? 'forward' : 'reverse'}
                    key={rowDays[0]}
                    role="group"
                    aria-label={`Days ${rowDays[0]} to ${rowDays.at(-1)}`}
                  >
                      {rowDays.map((day) => {
                        const dayEvents = eventsByDay.get(day) ?? [];
                        const primaryEvent = dayEvents.find((event) => event.kind === 'twist')
                          ?? dayEvents.find((event) => event.kind === 'milestone')
                          ?? dayEvents.find((event) => event.kind === 'finale')
                          ?? dayEvents[0];
                        const meta = primaryEvent ? CALENDAR_EVENT_META[primaryEvent.kind] : null;
                        return (
                          <motion.button
                            key={day}
                            type="button"
                            className="src-finale-calendar__day"
                            data-event={primaryEvent ? 'true' : 'false'}
                            data-kind={primaryEvent?.kind}
                            layoutId={primaryEvent ? `finale-day-${day}` : undefined}
                            aria-label={primaryEvent ? `Day ${day}: ${primaryEvent.title}, ${primaryEvent.label}` : `Day ${day}: no major event recorded`}
                            disabled={dayEvents.length === 0}
                            whileTap={primaryEvent ? { scale: 0.92 } : undefined}
                            onClick={() => setSelectedDay(day)}
                          >
                            <span className="src-finale-calendar__day-number">{String(day).padStart(2, '0')}</span>
                            {primaryEvent?.player && (
                              <span className="src-finale-calendar__day-portrait" aria-hidden="true">
                                <PlayerAvatar player={primaryEvent.player} size="sm" showEvictedStyle={false} showRelationshipOutline={false} />
                              </span>
                            )}
                            {meta && !primaryEvent?.player && <i aria-hidden="true">{meta.icon}</i>}
                            {meta && <small>{meta.label}</small>}
                            {dayEvents.length > 1 && <em aria-hidden="true">+{dayEvents.length - 1}</em>}
                          </motion.button>
                        );
                      })}
                  </div>
                ))}
              </div>
              <p className="src-finale-calendar__hint">Tap a marked date to open its archive card.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

export default function SeasonRecapCinematic({
  season,
  week,
  players,
  history = [],
  publicOpinion,
  onComplete,
}: SeasonRecapProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const recapData = useMemo(
    () => buildSeasonRecapData(players, week, publicOpinion),
    [players, publicOpinion, week],
  );
  const [view, setView] = useState<RecapView>('intro');
  const [selectedHonorIndex, setSelectedHonorIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const selectedHonor = recapData.categories[selectedHonorIndex] ?? recapData.categories[0];

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setVisible(false);
    window.setTimeout(() => onCompleteRef.current(), reducedMotion ? 0 : EXIT_FADE_MS);
  }, [reducedMotion]);

  useEffect(() => {
    if (view !== 'intro') return undefined;
    const timeout = window.setTimeout(
      () => setView('automatic-intro'),
      reducedMotion ? 0 : INTRO_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [reducedMotion, view]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finish]);

  const openHonor = useCallback((index: number) => {
    setSelectedHonorIndex(index);
    setView('honor');
  }, []);

  return (
    <motion.div
      className="src-explore"
      role="dialog"
      aria-modal="true"
      aria-label="Season recap archive"
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: reducedMotion ? 0 : EXIT_FADE_MS / 1000 }}
    >
      <div className="src-explore__ambient" aria-hidden="true" />
      <button className="src-explore__exit" type="button" onClick={finish} aria-label="Exit season recap">
        Exit <span aria-hidden="true">×</span>
      </button>
      <div className="src-explore__music" aria-label="Season recap music is playing">♫</div>

      <AnimatePresence mode="wait" initial={false}>
        {view === 'intro' && <RecapIntro key="intro" season={season} onSkip={() => setView('hub')} />}
        {view === 'automatic-intro' && (
          <AutomaticIntroduction
            key="automatic-intro"
            reducedMotion={reducedMotion}
            onComplete={() => setView('hub')}
          />
        )}
        {view === 'hub' && (
          <RecapHub
            key="hub"
            categoryCount={recapData.categories.length}
            onOpenAwards={() => setView('awards')}
            onOpenJourney={() => setView('journey')}
          />
        )}
        {view === 'awards' && (
          <AwardsList
            key="awards"
            categories={recapData.categories}
            onBack={() => setView('hub')}
            onSelect={openHonor}
          />
        )}
        {view === 'honor' && selectedHonor && (
          <motion.section
            key={`honor-${selectedHonor.id}`}
            className="src-explore-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button className="src-explore-back" type="button" onClick={() => setView('awards')}>
              <span aria-hidden="true">←</span> All categories
            </button>
            <HonorDetail category={selectedHonor} />
          </motion.section>
        )}
        {view === 'journey' && (
          <FinaleTimeline
            key="journey"
            recapData={recapData}
            week={week}
            history={history}
            onBack={() => setView('hub')}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
