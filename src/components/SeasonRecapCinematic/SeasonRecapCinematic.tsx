import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Player } from '../../types';
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
    return 'The expected eviction order broke here, reshaping the endgame.';
  }
  if (event.kind === 'milestone') {
    return 'Every vote after this point helped decide the eventual winner.';
  }
  if (event.kind === 'finale') {
    return 'The final vote closed the season and locked the finishing order.';
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

function buildTimelineCheckpoints(recapData: RecapData, week: number): TimelineCheckpoint[] {
  const totalDays = Math.max(week * 7, 7);
  const evictions = recapData.evictionLadder;
  const checkpoints = evictions.map((player, index) => {
    const inferredDay = Math.round(((index + 1) / (evictions.length + 1)) * totalDays);
    const day = Math.max(1, Math.min(totalDays - 1, (player.evictedAtWeek ?? 0) * 7 || inferredDay));
    const wasJury = player.status === 'jury';
    return {
      id: `eviction-${player.id}-${index}`,
      day,
      player,
      kind: 'eviction' as const,
      title: player.name,
      label: wasJury ? 'Jury seat' : 'Evicted',
      detail: wasJury
        ? `${player.name} took a seat on the jury.`
        : `${player.name}'s season ended here.`,
    };
  });
  const knownTwists: TimelineCheckpoint[] = [];
  const evictionsByDay = new Map<number, TimelineCheckpoint[]>();
  checkpoints.forEach((checkpoint) => {
    const entries = evictionsByDay.get(checkpoint.day) ?? [];
    entries.push(checkpoint);
    evictionsByDay.set(checkpoint.day, entries);
  });
  evictionsByDay.forEach((entries, day) => {
    if (entries.length < 2) return;
    knownTwists.push({
      id: `twist-eviction-${day}`,
      day,
      kind: 'twist',
      title: entries.length === 2 ? 'Double eviction' : 'Triple eviction',
      label: 'Twist night',
      detail: `${entries.length} housemates left the game on the same night.`,
    });
  });
  const firstJuror = checkpoints.find((checkpoint) => checkpoint.label === 'Jury seat');
  if (firstJuror) {
    knownTwists.push({
      id: `milestone-jury-${firstJuror.day}`,
      day: Math.max(1, firstJuror.day - 1),
      kind: 'milestone',
      title: 'Jury phase',
      label: 'Milestone',
      detail: 'The season entered its jury chapter.',
    });
  }
  evictions.filter((player) => (player.stats?.battleBackWins ?? 0) > 0).forEach((player, index) => {
    const departure = checkpoints.find((checkpoint) => checkpoint.player?.id === player.id);
    knownTwists.push({
      id: `twist-battle-back-${player.id}`,
      day: Math.min(totalDays - 1, (departure?.day ?? Math.round(totalDays / 2)) + index + 2),
      player,
      kind: 'twist',
      title: 'Battle back',
      label: 'Twist night',
      detail: `${player.name} fought their way back into the story.`,
    });
  });
  const finalePlayer = recapData.finalists.find((player) => player.isWinner) ?? recapData.finalists[0] ?? evictions.at(-1);

  if (!finalePlayer) return [...checkpoints, ...knownTwists].sort((a, b) => a.day - b.day);

  return [
    ...checkpoints,
    ...knownTwists,
    {
      id: `finale-${finalePlayer.id}`,
      day: totalDays,
      player: finalePlayer,
      kind: 'finale' as const,
      title: finalePlayer.name,
      label: finalePlayer.isWinner ? 'Winner crowned' : 'Final vote',
      detail: finalePlayer.isWinner
        ? `${finalePlayer.name} closed the season with the final crown.`
        : `The final vote put ${finalePlayer.name} in the spotlight.`,
    },
  ].sort((a, b) => a.day - b.day || (a.kind === 'twist' ? -1 : 1));
}

function FinaleCalendarFocus({
  day,
  events,
  onClose,
}: {
  day: number;
  events: TimelineCheckpoint[];
  onClose: () => void;
}) {
  const leadEvent = events.find((event) => event.kind === 'twist')
    ?? events.find((event) => event.kind === 'milestone')
    ?? events.find((event) => event.kind === 'finale')
    ?? events[0];

  if (!leadEvent) return null;

  const player = leadEvent.player;
  const totalWins = (player?.stats?.lohWins ?? 0) + (player?.stats?.posWins ?? 0);
  const placement = player?.isWinner || player?.finalRank === 1
    ? '#1'
    : player?.seasonPlacement
      ? `#${player.seasonPlacement}`
      : player?.finalRank
        ? `#${player.finalRank}`
        : '—';
  const impact = getMajorEventImpact(leadEvent);
  const involvedPlayers = events
    .map((event) => event.player)
    .filter((eventPlayer): eventPlayer is Player => Boolean(eventPlayer));

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
          <span>{leadEvent.detail}</span>
        </div>
      </div>
      {player && (
        <dl className="src-finale-calendar__focus-stats">
          <div><dt>Placement</dt><dd>{placement}</dd></div>
          <div><dt>Comp wins</dt><dd>{totalWins}</dd></div>
          <div><dt>Nominated</dt><dd>{player.stats?.timesNominated ?? 0}×</dd></div>
        </dl>
      )}
      {!player && involvedPlayers.length > 0 && (
        <div className="src-finale-calendar__focus-cast">
          <p>Housemates involved</p>
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
  onBack,
}: {
  recapData: RecapData;
  week: number;
  onBack: () => void;
}) {
  const checkpoints = useMemo(() => buildTimelineCheckpoints(recapData, week), [recapData, week]);
  const totalDays = Math.max(week * 7, 7);
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
  const chapterNumber = String(windowIndex + 1).padStart(2, '0');

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
      <div className="src-finale-calendar__tabs" role="tablist" aria-label="Season calendar ranges">
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
      <div className="src-finale-calendar__stage">
        <AnimatePresence initial={false} mode="popLayout">
          {selectedEvents.length > 0 && selectedDay != null ? (
            <FinaleCalendarFocus
              key={`focus-${selectedDay}`}
              day={selectedDay}
              events={selectedEvents}
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
              <div className="src-finale-calendar__summary" aria-label={`Chapter ${chapterNumber}: ${activeEventDays} event days`}>
                <span>CHAPTER {chapterNumber}</span>
                <strong>{activeEventDays} moments saved</strong>
              </div>
              <div className="src-finale-calendar__legend" aria-label="Event legend">
                {(Object.keys(CALENDAR_EVENT_META) as TimelineCheckpoint['kind'][]).map((kind) => {
                  const meta = CALENDAR_EVENT_META[kind];
                  return <span key={kind} data-kind={kind}><i aria-hidden="true">{meta.icon}</i>{meta.name}</span>;
                })}
              </div>
              <div className="src-finale-calendar__grid" aria-label={`Season days ${activeWindow?.start ?? 1} to ${activeWindow?.end ?? totalDays}`}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dayName, index) => (
                  <span key={`${dayName}-${index}`} className="src-finale-calendar__weekday" aria-hidden="true">{dayName}</span>
                ))}
                {calendarDays.map((day) => {
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
                      {dayEvents.length > 1 && <em aria-hidden="true">+{dayEvents.length - 1}</em>}
                    </motion.button>
                  );
                })}
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
          <FinaleTimeline key="journey" recapData={recapData} week={week} onBack={() => setView('hub')} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
