import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Player } from '../../types';
import useSound from '../../hooks/useSound';
import { resolveAvatar } from '../../utils/avatar';
import './SeasonRecapCinematic.css';

export interface SeasonRecapProps {
  season: number;
  week: number;
  players: Player[];
  onComplete: () => void;
}

type SceneId = 'opening' | 'stats' | 'drama' | 'twists' | 'ladder' | 'finale' | 'done';

interface SceneTiming {
  id: SceneId;
  durationMs: number;
}

interface RecapStat {
  label: string;
  value: string;
  accent: string;
}

interface RecapBeat {
  kicker: string;
  line: string;
  subject?: Player | null;
}

interface RecapTwistMoment {
  title: string;
  line: string;
  accent: string;
}

interface RecapData {
  headline: string;
  stats: RecapStat[];
  dramaBeats: RecapBeat[];
  twistMoments: RecapTwistMoment[];
  evictionLadder: Player[];
  finalists: Player[];
}

type TwistAccentStyle = CSSProperties & {
  '--twist-accent': string;
};

const DEFAULT_SCENE_TIMINGS: SceneTiming[] = [
  { id: 'opening', durationMs: 4400 },
  { id: 'stats', durationMs: 6000 },
  { id: 'drama', durationMs: 6800 },
  { id: 'twists', durationMs: 6800 },
  { id: 'ladder', durationMs: 8400 },
  { id: 'finale', durationMs: 4400 },
];

const MAX_LADDER_DISPLAY = 8;

function firstName(player: Player | null | undefined): string {
  return player?.name.split(' ')[0] ?? 'A finalist';
}

function totalCompWins(player: Player): number {
  return (player.stats?.hohWins ?? 0) + (player.stats?.povWins ?? 0);
}

function getPlacementValue(player: Player): number | null {
  if (typeof player.seasonPlacement === 'number') return player.seasonPlacement;
  if (typeof player.finalRank === 'number') return player.finalRank;
  return null;
}

function isFinalistStatus(status: Player['status']): boolean {
  return (
    status === 'active' ||
    status === 'hoh' ||
    status === 'pov' ||
    status === 'nominated' ||
    status === 'hoh+pov' ||
    status === 'nominated+pov'
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

function getTopCompetitor(players: Player[]): Player | null {
  return players.reduce<Player | null>((best, player) => {
    if (!best) return player;
    return totalCompWins(player) > totalCompWins(best) ? player : best;
  }, null);
}

function getMostNominated(players: Player[]): Player | null {
  return players.reduce<Player | null>((mostNominated, player) => {
    if (!mostNominated) return player;
    return (player.stats?.timesNominated ?? 0) > (mostNominated.stats?.timesNominated ?? 0)
      ? player
      : mostNominated;
  }, null);
}

function getTopVetoPlayer(players: Player[]): Player | null {
  return players.reduce<Player | null>((best, player) => {
    if (!best) return player;
    return (player.stats?.povWins ?? 0) > (best.stats?.povWins ?? 0) ? player : best;
  }, null);
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

function buildRecapData(players: Player[], week: number): RecapData {
  const evictionLadder = buildEvictionList(players);
  const finalists = buildFinalists(players);
  const topComp = getTopCompetitor(players);
  const mostNom = getMostNominated(players);
  const topVeto = getTopVetoPlayer(players);
  const totalPlayers = players.length;
  const jurySize = players.filter((player) => player.status === 'jury').length;

  const stats: RecapStat[] = [
    {
      label: 'Competitions Won',
      value: String(topComp ? totalCompWins(topComp) : week),
      accent: `${firstName(topComp)} took command`,
    },
    {
      label: 'Vetoes Won',
      value: String(topVeto?.stats?.povWins ?? Math.max(1, Math.floor(week / 2))),
      accent: `${firstName(topVeto)} kept the power shifting`,
    },
    {
      label: 'Nominations Survived',
      value: String(mostNom?.stats?.timesNominated ?? Math.max(2, jurySize)),
      accent: `${firstName(mostNom)} kept surviving the block`,
    },
    {
      label: 'Houseguests',
      value: String(totalPlayers),
      accent: `${evictionLadder.length} exits led us here`,
    },
  ];

  const dramaBeats: RecapBeat[] = [
    {
      kicker: 'ALLIANCES FORMED',
      line: `${firstName(topComp)} built momentum. The house followed the power.`,
      subject: topComp,
    },
    {
      kicker: 'TRUST WAS BROKEN',
      line: `${firstName(mostNom)} kept hearing their name — and kept surviving anyway.`,
      subject: mostNom,
    },
    {
      kicker: 'THE GAME TURNED',
      line: `${firstName(topVeto)} turned veto wins into leverage when everything shifted.`,
      subject: topVeto,
    },
  ];

  const twistMoments: RecapTwistMoment[] = [
    {
      title: 'Blindside',
      line: 'One vote flipped the temperature of the entire house.',
      accent: 'rgba(255, 116, 143, 0.95)',
    },
    {
      title: 'Backdoor',
      line: 'Plans changed in secret. By the ceremony, someone never saw the block coming.',
      accent: 'rgba(255, 196, 87, 0.95)',
    },
    {
      title: 'Block Survivor',
      line:
        mostNom && (mostNom.stats?.timesNominated ?? 0) > 1
          ? `${firstName(mostNom)} survived the chopping block so many times it became the season's signature story.`
          : 'A nomination never stayed simple for long.',
      accent: 'rgba(127, 198, 255, 0.95)',
    },
  ];

  return {
    headline: 'The Road to the Finale',
    stats,
    dramaBeats,
    twistMoments,
    evictionLadder,
    finalists,
  };
}

function SceneFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      className={['src-scene', className].filter(Boolean).join(' ')}
      initial={{ opacity: 0, scale: 1.04, filter: 'blur(18px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.985, filter: 'blur(12px)' }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.section>
  );
}

function OpeningScene({ season, week, headline }: { season: number; week: number; headline: string }) {
  return (
    <SceneFrame className="src-scene--opening">
      <div className="src-opening-copy">
        <span className="src-opening-kicker">Season {season}</span>
        <h1 className="src-opening-title">{headline}</h1>
        <p className="src-opening-subtitle">{week} weeks of chaos. One last decision.</p>
      </div>
      <div className="src-light-streak src-light-streak--1" aria-hidden="true" />
      <div className="src-light-streak src-light-streak--2" aria-hidden="true" />
    </SceneFrame>
  );
}

function StatsScene({ stats }: { stats: RecapStat[] }) {
  return (
    <SceneFrame className="src-scene--stats">
      <div className="src-scene-heading">
        <span className="src-scene-heading__eyebrow">Season Stats</span>
        <h2 className="src-scene-heading__title">Big numbers. Bigger consequences.</h2>
      </div>
      <div className="src-stats-montage">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            className={`src-stat-burst src-stat-burst--${index + 1}`}
            initial={{ opacity: 0, y: 28, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.12 * index, duration: 0.45 }}
          >
            <span className="src-stat-burst__value">{stat.value}</span>
            <span className="src-stat-burst__label">{stat.label}</span>
            <span className="src-stat-burst__accent">{stat.accent}</span>
          </motion.div>
        ))}
      </div>
    </SceneFrame>
  );
}

function DramaScene({ beats }: { beats: RecapBeat[] }) {
  return (
    <SceneFrame className="src-scene--drama">
      <div className="src-drama-stack">
        {beats.map((beat, index) => (
          <motion.article
            key={beat.kicker}
            className={`src-drama-beat src-drama-beat--${index + 1}`}
            initial={{ opacity: 0, x: index % 2 === 0 ? -24 : 24, y: 18 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ delay: 0.18 * index, duration: 0.45 }}
          >
            <span className="src-drama-beat__kicker">{beat.kicker}</span>
            <p className="src-drama-beat__line">{beat.line}</p>
            {beat.subject && (
              <div className="src-avatar-chip">
                <img src={resolveAvatar(beat.subject)} alt={beat.subject.name} className="src-avatar-chip__img" />
                <span>{beat.subject.name}</span>
              </div>
            )}
          </motion.article>
        ))}
      </div>
      <div className="src-scene-wordmark" aria-hidden="true">
        TRUST • POWER • CHAOS
      </div>
    </SceneFrame>
  );
}

function TwistsScene({ moments }: { moments: RecapTwistMoment[] }) {
  return (
    <SceneFrame className="src-scene--twists">
      <div className="src-twist-strip">
        {moments.map((moment, index) => (
          <motion.div
            key={moment.title}
            className={`src-twist-card src-twist-card--${index + 1}`}
            initial={{ opacity: 0, rotate: index % 2 === 0 ? -6 : 6, scale: 0.92 }}
            animate={{ opacity: 1, rotate: index % 2 === 0 ? -3 : 3, scale: 1 }}
            transition={{ delay: 0.15 * index, duration: 0.42 }}
            style={{ '--twist-accent': moment.accent } as TwistAccentStyle}
          >
            <span className="src-twist-card__title">{moment.title}</span>
            <p className="src-twist-card__line">{moment.line}</p>
          </motion.div>
        ))}
      </div>
      <div className="src-flash-cut" aria-hidden="true" />
    </SceneFrame>
  );
}

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
    const stepMs = Math.max(360, Math.floor(durationMs / players.length));
    const timer = setInterval(() => {
      setActiveIndex((current) => {
        if (current >= players.length - 1) return current;
        return current + 1;
      });
    }, stepMs);
    return () => clearInterval(timer);
  }, [durationMs, players.length]);

  const current = players[activeIndex] ?? players[0];

  return (
    <SceneFrame className="src-scene--ladder">
      <div className="src-ladder-header">
        <span className="src-scene-heading__eyebrow">Eviction Ladder</span>
        <h2 className="src-scene-heading__title">One by one, the season fell away.</h2>
      </div>
      <div className="src-ladder-stage">
        <div className="src-ladder-portrait">
          {current && (
            <img src={resolveAvatar(current)} alt={current.name} className="src-ladder-portrait__img" />
          )}
        </div>
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

function FinaleScene({ finalists }: { finalists: Player[] }) {
  return (
    <SceneFrame className="src-scene--finale">
      <div className="src-finale-copy">
        <span className="src-scene-heading__eyebrow">Final Sting</span>
        <h2 className="src-finale-copy__lead">And now…</h2>
        <h3 className="src-finale-copy__title">The jury decides.</h3>
      </div>
      <div className="src-finalists-band">
        {finalists.map((finalist) => (
          <div key={finalist.id} className="src-finalist-portrait">
            <img src={resolveAvatar(finalist)} alt={finalist.name} className="src-finalist-portrait__img" />
            <span className="src-finalist-portrait__name">{finalist.name}</span>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
}

export default function SeasonRecapCinematic({ season, week, players, onComplete }: SeasonRecapProps) {
  const { playMusic, stopMusic } = useSound();
  const prefersReducedMotion = useReducedMotion();
  const noAnimations =
    typeof document !== 'undefined' && document.body.classList.contains('no-animations');
  const reducedMotion = prefersReducedMotion || noAnimations;
  const recapData = useMemo(() => buildRecapData(players, week), [players, week]);
  const timings = useMemo(
    () =>
      reducedMotion
        ? DEFAULT_SCENE_TIMINGS.map((scene) => ({
            ...scene,
            durationMs: Math.min(scene.durationMs, 250),
          }))
        : DEFAULT_SCENE_TIMINGS,
    [reducedMotion],
  );
  const [sceneIndex, setSceneIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const didFinishRef = useRef(false);

  const finish = useCallback(() => {
    if (didFinishRef.current) return;
    didFinishRef.current = true;
    setVisible(false);
    stopMusic();
    const timer = setTimeout(() => onComplete(), reducedMotion ? 0 : 420);
    return () => clearTimeout(timer);
  }, [onComplete, reducedMotion, stopMusic]);

  useEffect(() => {
    playMusic('music:season_recap');
    return () => stopMusic();
  }, [playMusic, stopMusic]);

  useEffect(() => {
    if (sceneIndex >= timings.length) {
      const timer = setTimeout(() => {
        finish();
      }, 0);
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
        <button type="button" className="src-skip-btn" onClick={() => finish()} aria-label="Skip recap">
          Skip
        </button>
      )}

      <AnimatePresence mode="wait">
        {currentScene?.id === 'opening' && (
          <OpeningScene key="opening" season={season} week={week} headline={recapData.headline} />
        )}
        {currentScene?.id === 'stats' && <StatsScene key="stats" stats={recapData.stats} />}
        {currentScene?.id === 'drama' && <DramaScene key="drama" beats={recapData.dramaBeats} />}
        {currentScene?.id === 'twists' && <TwistsScene key="twists" moments={recapData.twistMoments} />}
        {currentScene?.id === 'ladder' && (
          <EvictionLadderScene
            key="ladder"
            players={recapData.evictionLadder}
            durationMs={currentScene.durationMs}
          />
        )}
        {currentScene?.id === 'finale' && <FinaleScene key="finale" finalists={recapData.finalists} />}
      </AnimatePresence>
    </motion.div>
  );
}
