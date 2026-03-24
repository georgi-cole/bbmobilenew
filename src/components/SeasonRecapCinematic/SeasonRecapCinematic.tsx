/**
 * SeasonRecapCinematic — fullscreen animated recap of the season.
 *
 * Shown once per finale before the tribunal vote reveal begins.
 * Displays season stats, major moments, and the eviction flashback in
 * placement order (16th, 15th, …, Final 2).
 */
import { useState, useEffect, useCallback } from 'react';
import type { Player } from '../../types';
import { resolveAvatar } from '../../utils/avatar';
import './SeasonRecapCinematic.css';

export interface SeasonRecapProps {
  season: number;
  week: number;
  players: Player[];
  onComplete: () => void;
}

// ─── Recap stage ids ──────────────────────────────────────────────────────────

type RecapStage =
  | 'intro'
  | 'stats'
  | 'moments'
  | 'evictions'
  | 'finalists'
  | 'done';

const STAGE_ORDER: RecapStage[] = ['intro', 'stats', 'moments', 'evictions', 'finalists', 'done'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalCompWins(p: Player): number {
  return (p.stats?.hohWins ?? 0) + (p.stats?.povWins ?? 0);
}

function buildEvictionList(players: Player[]): Player[] {
  // Evicted players (pre-jury) then jury members, finalists at the end.
  // We can approximate order by using the array order in game.players
  // (players are added in draft order and status changes reflect eviction time).
  const evicted = players.filter((p) => p.status === 'evicted');
  const jury = players.filter((p) => p.status === 'jury');
  const finalists = players.filter(
    (p) => p.status === 'active' || p.status === 'hoh' || p.status === 'pov' ||
           p.status === 'nominated' || p.status === 'hoh+pov' || p.status === 'nominated+pov',
  );
  // Order: evicted first (earliest evicted first) then jury (earliest first)
  return [...evicted, ...jury, ...finalists];
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

const MOMENT_CARDS = [
  { icon: '🔪', label: 'Blindside', text: 'A trusted ally turned the knife when no one saw it coming.' },
  { icon: '🚪', label: 'Backdoor', text: 'The perfect plan executed in secret — someone never saw the block coming.' },
  { icon: '🌀', label: 'Twist', text: 'The house bent its rules. Nothing was ever the same after that week.' },
  { icon: '💬', label: 'Social War', text: 'Alliances formed, shattered, and reformed in the blink of an eye.' },
  { icon: '🎯', label: 'Power Move', text: 'One week changed the entire trajectory of this season.' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function SeasonRecapCinematic({ season, week, players, onComplete }: SeasonRecapProps) {
  const [stage, setStage] = useState<RecapStage>('intro');
  const [evictionIdx, setEvictionIdx] = useState(0);
  const [momentIdx, setMomentIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  const evictionList = buildEvictionList(players);
  const totalPlayers = players.length;
  const totalEvictions = evictionList.length - 2; // last two are finalists
  const topComp = getTopCompetitor(players);
  const mostNom = getMostNominated(players);

  const advance = useCallback(() => {
    setStage((s) => {
      const idx = STAGE_ORDER.indexOf(s);
      if (idx < STAGE_ORDER.length - 1) return STAGE_ORDER[idx + 1];
      return s;
    });
  }, []);

  // Auto-advance intro
  useEffect(() => {
    if (stage !== 'intro') return;
    const t = setTimeout(advance, 2200);
    return () => clearTimeout(t);
  }, [stage, advance]);

  // Handle done → fade out → call onComplete
  useEffect(() => {
    if (stage !== 'done') return;
    const fadeTimer = setTimeout(() => setVisible(false), 0);
    const completeTimer = setTimeout(onComplete, 700);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [stage, onComplete]);

  const placement = (idx: number): string => {
    const n = totalPlayers - idx;
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
    if (mod10 === 1) return `${n}st`;
    if (mod10 === 2) return `${n}nd`;
    if (mod10 === 3) return `${n}rd`;
    return `${n}th`;
  };

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

      {/* ── Intro ── */}
      {stage === 'intro' && (
        <div className="src-card src-card--intro src-card--enter" key="intro">
          <span className="src-eyebrow">Season {season}</span>
          <h1 className="src-headline">A Season to Remember</h1>
          <p className="src-sub">{week} weeks · {totalPlayers} houseguests · one Tribunal</p>
          <div className="src-pulse-ring" aria-hidden="true" />
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
          <button type="button" className="src-btn" onClick={advance}>
            Next ▶
          </button>
        </div>
      )}

      {/* ── Moments ── */}
      {stage === 'moments' && (
        <div className="src-card src-card--moments src-card--enter" key={`moment-${momentIdx}`}>
          <span className="src-eyebrow">Moments that Defined the Season</span>
          <div className="src-moment-icon" aria-hidden="true">
            {MOMENT_CARDS[momentIdx % MOMENT_CARDS.length].icon}
          </div>
          <p className="src-moment-label">
            {MOMENT_CARDS[momentIdx % MOMENT_CARDS.length].label}
          </p>
          <p className="src-moment-text">
            {MOMENT_CARDS[momentIdx % MOMENT_CARDS.length].text}
          </p>
          <div className="src-moment-dots" aria-hidden="true">
            {MOMENT_CARDS.map((_, i) => (
              <span
                key={i}
                className={`src-dot${i === momentIdx % MOMENT_CARDS.length ? ' src-dot--active' : ''}`}
              />
            ))}
          </div>
          <button
            type="button"
            className="src-btn"
            onClick={() => {
              if (momentIdx < MOMENT_CARDS.length - 1) {
                setMomentIdx((n) => n + 1);
              } else {
                advance();
              }
            }}
          >
            {momentIdx < MOMENT_CARDS.length - 1 ? 'Next Moment ▶' : 'Continue ▶'}
          </button>
        </div>
      )}

      {/* ── Eviction flashback ── */}
      {stage === 'evictions' && (
        <div className="src-card src-card--evictions src-card--enter" key={`evict-${evictionIdx}`}>
          <span className="src-eyebrow">The Road to the Finale</span>
          {evictionIdx < evictionList.length ? (
            <>
              <div className="src-evict-placement">
                {placement(evictionIdx)}
              </div>
              <div className="src-evict-avatar">
                <img
                  src={resolveAvatar(evictionList[evictionIdx])}
                  alt={evictionList[evictionIdx].name}
                  className="src-evict-img"
                />
              </div>
              <p className="src-evict-name">{evictionList[evictionIdx].name}</p>
              <p className="src-evict-sub">
                {evictionList[evictionIdx].status === 'evicted' || evictionList[evictionIdx].status === 'jury'
                  ? 'Evicted from the Big Eye House'
                  : '🏆 Made it to the Final 2'}
              </p>
              <div className="src-evict-progress">
                <div
                  className="src-evict-progress__bar"
                  style={{ width: `${((evictionIdx + 1) / evictionList.length) * 100}%` }}
                />
              </div>
              <button
                type="button"
                className="src-btn"
                onClick={() => {
                  if (evictionIdx < evictionList.length - 1) {
                    setEvictionIdx((n) => n + 1);
                  } else {
                    advance();
                  }
                }}
              >
                {evictionIdx < evictionList.length - 1 ? 'Next ▶' : 'Continue ▶'}
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* ── Finalists reveal before tribunal ── */}
      {stage === 'finalists' && (
        <div className="src-card src-card--finalists src-card--enter" key="finalists">
          <span className="src-eyebrow">The Final Tribunal Awaits</span>
          <div className="src-finalist-row">
            {evictionList.slice(-2).map((f) => (
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
          <button type="button" className="src-btn src-btn--gold" onClick={advance}>
            Enter the Tribunal 🏛️
          </button>
        </div>
      )}
    </div>
  );
}
