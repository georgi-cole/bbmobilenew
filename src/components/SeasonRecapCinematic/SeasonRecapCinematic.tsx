/**
 * SeasonRecapCinematic — fullscreen auto-playing cinematic recap of the season.
 *
 * Shown once per finale, positioned between the clue stage and vote reveal.
 * All stages advance automatically on timers — no user clicks required.
 * A "Skip" button in the corner lets accessibility / impatient viewers jump ahead.
 *
 * Stages:
 *   intro     (2.5 s) → season opener card
 *   stats     (5.5 s) → season-by-the-numbers grid
 *   moments   (3.5 s × 5 cards) → defining season moments
 *   evictions (2.2 s each)  → eviction flashback (16th, 15th, …)
 *   finalists (4.0 s) → final two revealed
 *   done            → fade out → onComplete
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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

// ─── Stage definitions ─────────────────────────────────────────────────────────

type RecapStage =
  | 'intro'
  | 'stats'
  | 'moments'
  | 'evictions'
  | 'finalists'
  | 'done';

const STAGE_ORDER: RecapStage[] = ['intro', 'stats', 'moments', 'evictions', 'finalists', 'done'];

/** Duration each stage card is displayed before auto-advancing (ms). */
const STAGE_DURATIONS: Record<RecapStage, number> = {
  intro:     2500,
  stats:     5500,
  moments:   3500,  // per moment card
  evictions: 2200,  // per eviction card
  finalists: 4000,
  done:      0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalCompWins(p: Player): number {
  return (p.stats?.hohWins ?? 0) + (p.stats?.povWins ?? 0);
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
      const aP = getPlacementValue(a.player);
      const bP = getPlacementValue(b.player);
      if (aP != null && bP != null) return bP - aP; // 16th first
      if (aP != null) return -1;
      if (bP != null) return 1;
      return a.index - b.index;
    })
    .map(({ player }) => player);
}

function buildFinalists(players: Player[]): Player[] {
  return players.filter((player) => isFinalistStatus(player.status)).slice(0, 2);
}

function getTopCompetitor(players: Player[]): Player | null {
  return players.reduce<Player | null>((best, p) => {
    if (!best) return p;
    return totalCompWins(p) > totalCompWins(best) ? p : best;
  }, null);
}

function getMostNominated(players: Player[]): Player | null {
  return players.reduce<Player | null>((most, p) => {
    if (!most) return p;
    return (p.stats?.timesNominated ?? 0) > (most.stats?.timesNominated ?? 0) ? p : most;
  }, null);
}

function placement(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

const MOMENT_CARDS = [
  { icon: '🔪', label: 'Blindside',   text: 'A trusted ally turned the knife. No one saw it coming.' },
  { icon: '🚪', label: 'Backdoor',    text: 'The perfect plan executed in secret — the block without a competition loss.' },
  { icon: '🌀', label: 'Twist',       text: 'The house bent its own rules. Nothing was ever the same after that week.' },
  { icon: '💬', label: 'Social War',  text: 'Alliances formed, shattered, and reformed in the blink of an eye.' },
  { icon: '🎯', label: 'Power Move',  text: 'One decision changed the entire trajectory of this season.' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SeasonRecapCinematic({ season, week, players, onComplete }: SeasonRecapProps) {
  const { playMusic, stopMusic } = useSound();
  const [stage, setStage] = useState<RecapStage>('intro');
  const [subIdx, setSubIdx] = useState(0);  // moment or eviction index within that stage
  const [visible, setVisible] = useState(true);
  const [progressKey, setProgressKey] = useState(0); // resets CSS progress bar animation
  const noAnim = useRef(
    typeof document !== 'undefined' && document.body.classList.contains('no-animations'),
  );

  const evictionList = buildEvictionList(players);
  const finalists = buildFinalists(players);
  const totalPlayers = players.length;
  const totalEvictions = evictionList.length;
  const topComp = getTopCompetitor(players);
  const mostNom = getMostNominated(players);

  // ── Play recap music on mount ──────────────────────────────────────────
  useEffect(() => {
    playMusic('music:season_recap');
    return () => stopMusic();
  }, [playMusic, stopMusic]);

  // ── Helper: advance to next stage or next sub-card ─────────────────────
  const advance = useCallback(() => {
    setProgressKey((k) => k + 1);
    setStage((s) => {
      if (s === 'moments') {
        if (subIdx < MOMENT_CARDS.length - 1) {
          setSubIdx((n) => n + 1);
          return 'moments'; // stay, next card
        }
        setSubIdx(0);
        return 'evictions';
      }
      if (s === 'evictions') {
        if (subIdx < evictionList.length - 1) {
          setSubIdx((n) => n + 1);
          return 'evictions';
        }
        setSubIdx(0);
        return 'finalists';
      }
      const idx = STAGE_ORDER.indexOf(s);
      return idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : s;
    });
  }, [subIdx, evictionList.length]);

  // ── Skip all: jump straight to done ────────────────────────────────────
  const skipAll = useCallback(() => {
    setStage('done');
  }, []);

  // ── Auto-advance timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (stage === 'done') return;
    const dur = noAnim.current ? 0 : STAGE_DURATIONS[stage];
    const t = setTimeout(advance, dur);
    return () => clearTimeout(t);
  }, [stage, subIdx, advance]);

  // ── Done: fade out then call onComplete ────────────────────────────────
  useEffect(() => {
    if (stage !== 'done') return;
    const fade = setTimeout(() => setVisible(false), 0);
    const done = setTimeout(() => { stopMusic(); onComplete(); }, 700);
    return () => { clearTimeout(fade); clearTimeout(done); };
  }, [stage, onComplete, stopMusic]);

  const stageDuration = STAGE_DURATIONS[stage];

  return (
    <div
      className={`src-overlay${!visible ? ' src-overlay--fadeout' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Season recap cinematic"
    >
      {/* Ambient background rings */}
      <div className="src-rings" aria-hidden="true">
        <div className="src-ring src-ring--1" />
        <div className="src-ring src-ring--2" />
        <div className="src-ring src-ring--3" />
      </div>

      {/* Spotlight sweep */}
      <div className="src-spotlight" aria-hidden="true" />

      {/* Skip button — always visible, top-right */}
      {stage !== 'done' && (
        <button type="button" className="src-skip-btn" onClick={skipAll} aria-label="Skip recap">
          Skip ▶▶
        </button>
      )}

      {/* ── Intro ── */}
      {stage === 'intro' && (
        <div className="src-card src-card--intro src-card--enter" key="intro">
          <span className="src-eyebrow">Season {season}</span>
          <h1 className="src-headline">A Season to Remember</h1>
          <p className="src-sub">{week} weeks · {totalPlayers} houseguests · one Tribunal</p>
          <div className="src-pulse-ring" aria-hidden="true" />
          <div className="src-auto-bar" key={`bar-intro-${progressKey}`} style={{ '--duration': `${stageDuration}ms` } as React.CSSProperties} aria-hidden="true" />
        </div>
      )}

      {/* ── Stats ── */}
      {stage === 'stats' && (
        <div className="src-card src-card--stats src-card--enter" key="stats">
          <span className="src-eyebrow">Season by the Numbers</span>
          <div className="src-stat-grid">
            <div className="src-stat">
              <span className="src-stat__num">{week}</span>
              <span className="src-stat__label">Weeks Played</span>
            </div>
            <div className="src-stat">
              <span className="src-stat__num">{totalPlayers}</span>
              <span className="src-stat__label">Houseguests</span>
            </div>
            <div className="src-stat">
              <span className="src-stat__num">{totalEvictions}</span>
              <span className="src-stat__label">Evictions</span>
            </div>
            <div className="src-stat">
              <span className="src-stat__num">{topComp ? totalCompWins(topComp) : 0}</span>
              <span className="src-stat__label">
                {topComp ? `${topComp.name.split(' ')[0]}'s Wins` : 'Comp Wins'}
              </span>
            </div>
            {mostNom && (mostNom.stats?.timesNominated ?? 0) > 0 && (
              <div className="src-stat src-stat--wide">
                <span className="src-stat__num">{mostNom.stats?.timesNominated ?? 0}×</span>
                <span className="src-stat__label">
                  {mostNom.name.split(' ')[0]} survived the block
                </span>
              </div>
            )}
          </div>
          <div className="src-auto-bar" key={`bar-stats-${progressKey}`} style={{ '--duration': `${stageDuration}ms` } as React.CSSProperties} aria-hidden="true" />
        </div>
      )}

      {/* ── Moments ── */}
      {stage === 'moments' && (
        <div className="src-card src-card--moments src-card--enter" key={`moment-${subIdx}`}>
          <span className="src-eyebrow">Moments that Defined the Season</span>
          <div className="src-moment-icon" aria-hidden="true">
            {MOMENT_CARDS[subIdx % MOMENT_CARDS.length].icon}
          </div>
          <p className="src-moment-label">
            {MOMENT_CARDS[subIdx % MOMENT_CARDS.length].label}
          </p>
          <p className="src-moment-text">
            {MOMENT_CARDS[subIdx % MOMENT_CARDS.length].text}
          </p>
          <div className="src-moment-dots" aria-hidden="true">
            {MOMENT_CARDS.map((_, i) => (
              <span
                key={i}
                className={`src-dot${i === subIdx % MOMENT_CARDS.length ? ' src-dot--active' : ''}`}
              />
            ))}
          </div>
          <div className="src-auto-bar" key={`bar-moment-${subIdx}-${progressKey}`} style={{ '--duration': `${stageDuration}ms` } as React.CSSProperties} aria-hidden="true" />
        </div>
      )}

      {/* ── Eviction flashback ── */}
      {stage === 'evictions' && subIdx < evictionList.length && (
        <div className="src-card src-card--evictions src-card--enter" key={`evict-${subIdx}`}>
          <span className="src-eyebrow">The Road to the Finale</span>
          <div className="src-evict-placement">
            {placement(getPlacementValue(evictionList[subIdx]) ?? totalPlayers - subIdx)}
          </div>
          <div className="src-evict-avatar">
            <img
              src={resolveAvatar(evictionList[subIdx])}
              alt={evictionList[subIdx].name}
              className="src-evict-img"
            />
          </div>
          <p className="src-evict-name">{evictionList[subIdx].name}</p>
          <p className="src-evict-sub">
            {evictionList[subIdx].status === 'evicted' || evictionList[subIdx].status === 'jury'
              ? 'Evicted from the Big Eye House'
              : '🏆 Made it to the Final 2'}
          </p>
          <div className="src-evict-progress">
            <div
              className="src-evict-progress__bar"
              style={{ width: `${((subIdx + 1) / evictionList.length) * 100}%` }}
            />
          </div>
          <div className="src-auto-bar" key={`bar-evict-${subIdx}-${progressKey}`} style={{ '--duration': `${stageDuration}ms` } as React.CSSProperties} aria-hidden="true" />
        </div>
      )}

      {/* ── Finalists reveal ── */}
      {stage === 'finalists' && (
        <div className="src-card src-card--finalists src-card--enter" key="finalists">
          <span className="src-eyebrow">The Final Tribunal Awaits</span>
          <div className="src-finalist-row">
            {finalists.map((f) => (
              <div key={f.id} className="src-finalist-card">
                <div className="src-finalist-glow" aria-hidden="true" />
                <img
                  src={resolveAvatar(f)}
                  alt={f.name}
                  className="src-finalist-img"
                />
                <span className="src-finalist-name">{f.name}</span>
              </div>
            ))}
          </div>
          <p className="src-finalists-copy">
            Two houseguests stand before the judges. Only one walks away with The Big Eye.
          </p>
          <div className="src-auto-bar" key={`bar-finalists-${progressKey}`} style={{ '--duration': `${stageDuration}ms` } as React.CSSProperties} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
