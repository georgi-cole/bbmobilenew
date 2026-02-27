/**
 * BattleBackOverlay — full-screen "Jury Return / Battle Back" twist overlay.
 *
 * UX flow (4 steps):
 *  1. announcement — orange full-screen splash; tap to continue.
 *  2. info         — explanation card; tap to start voting.
 *  3. voting       — TV-broadcast Memory Wall: portrait grid with SVG ring
 *                    gauges, scrolling ticker, and countdown strip. Lowest
 *                    candidate eliminated every 3.5 s.
 *  4. winner       — winner reveal with colour animation; tap to close.
 *
 * Props:
 *  candidates  — Player objects eligible to compete (all current jurors).
 *  seed        — Seeded RNG value for reproducible simulation.
 *  onComplete  — Called with the winning player ID when the overlay closes.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Player } from '../../types';
import { useBattleBackVoting } from '../../hooks/useBattleBackVoting';
import { resolveAvatar } from '../../utils/avatar';
import './BattleBackOverlay.css';

interface Props {
  candidates: Player[];
  seed: number;
  onComplete: (winnerId: string) => void;
}

type Step = 'announcement' | 'info' | 'voting' | 'winner';

const ELIM_INTERVAL_MS = 3500;
/** Centre and radius of the SVG ring gauge (px inside a 76×76 viewBox). */
const RING_CX = 38;
const RING_CY = 38;
const RING_R = 34;
const RING_STROKE = 3.5;
const RING_TRACK_COLOR = 'rgba(255,255,255,0.1)';
const RING_CIRC = 2 * Math.PI * RING_R;
/** Repeated twice in the DOM so the CSS marquee loops seamlessly. */
const TICKER_MSG = 'The public is voting to save a juror… One will return to the Big Brother house! ✦  ';

export default function BattleBackOverlay({ candidates, seed, onComplete }: Props) {
  const [step, setStep] = useState<Step>('announcement');
  const firedRef = useRef(false);

  // Memoize the ID list so the hook's dep array sees a stable reference across
  // re-renders (candidates list doesn't change during a single Battle Back session).
  const candidateIds = useMemo(() => candidates.map((c) => c.id), [candidates]);

  const { votes, eliminated, winnerId, isComplete } = useBattleBackVoting({
    candidates: candidateIds,
    seed,
    eliminationIntervalMs: ELIM_INTERVAL_MS,
    tickIntervalMs: 400,
  });

  // Countdown strip: counts down from floor(ELIM_INTERVAL_MS/1000) to 0,
  // resetting each time a new elimination is detected.
  const [countdown, setCountdown] = useState(Math.floor(ELIM_INTERVAL_MS / 1000));
  const prevElimLenRef = useRef(0);
  useEffect(() => {
    if (eliminated.length > prevElimLenRef.current) {
      prevElimLenRef.current = eliminated.length;
      setCountdown(Math.floor(ELIM_INTERVAL_MS / 1000));
    }
  }, [eliminated]);
  useEffect(() => {
    if (step !== 'voting' || isComplete) return;
    const id = setInterval(
      () => setCountdown((prev) => Math.max(0, prev - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [step, isComplete]);

  // When voting finishes, transition to winner step automatically.
  useEffect(() => {
    if (isComplete && step === 'voting') {
      setStep('winner');
    }
  }, [isComplete, step]);

  function handleClose() {
    if (firedRef.current || !winnerId) return;
    firedRef.current = true;
    onComplete(winnerId);
  }

  return (
    <div
      className="bb-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Battle Back twist overlay"
    >
      <div className="bb-overlay__dim" />

      {/* ── Step 1: Announcement ─────────────────────────────────────────── */}
      {step === 'announcement' && (
        <div
          className="bb-overlay__card bb-overlay__card--announcement"
          onClick={() => setStep('info')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setStep('info')}
          aria-label="Battle Back announcement — tap to continue"
        >
          <div className="bb-overlay__emoji" aria-hidden="true">🔥</div>
          <p className="bb-overlay__label">TWIST</p>
          <h1 className="bb-overlay__title">JURY RETURN!</h1>
          <h2 className="bb-overlay__subtitle">Battle Back</h2>
          <p className="bb-overlay__tap-hint">tap to continue</p>
        </div>
      )}

      {/* ── Step 2: Info ─────────────────────────────────────────────────── */}
      {step === 'info' && (
        <div
          className="bb-overlay__card bb-overlay__card--info"
          onClick={() => setStep('voting')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setStep('voting')}
          aria-label="Battle Back info — tap to start voting"
        >
          <div className="bb-overlay__emoji" aria-hidden="true">🏆</div>
          <h2 className="bb-overlay__title bb-overlay__title--md">How It Works</h2>
          <ul className="bb-overlay__info-list" role="list">
            <li>The public votes for their favourite juror to return.</li>
            <li>One by one the jurors with the lowest viewer support are eliminated.</li>
            <li>The last juror standing wins and re-enters the house!</li>
          </ul>
          <p className="bb-overlay__tap-hint">tap to watch the vote live</p>
        </div>
      )}

      {/* ── Step 3: Memory Wall — Live Voting ────────────────────────────── */}
      {step === 'voting' && (
        <div className="bb-wall" role="region" aria-label="Live Battle Back voting">

          {/* Broadcast header */}
          <header className="bb-wall__header">
            <div className="bb-wall__header-inner">
              <span className="bb-wall__brand" aria-hidden="true">📺</span>
              <span className="bb-wall__brand-title">BATTLE BACK</span>
              <div className="bb-wall__live-badge" aria-label="Live broadcast">
                <span className="bb-wall__live-dot" aria-hidden="true" />
                LIVE
              </div>
            </div>
          </header>

          {/* Scrolling ticker */}
          <div className="bb-wall__ticker-wrap" aria-hidden="true">
            <span className="bb-wall__ticker">{TICKER_MSG}{TICKER_MSG}</span>
          </div>

          {/* Memory wall grid */}
          <ul className="bb-wall__grid" role="list">
            {candidates.map((player) => {
              const isEliminated = eliminated.includes(player.id);
              const pct = isEliminated ? 0 : (votes[player.id] ?? 0);
              const dashOffset = RING_CIRC * (1 - pct / 100);
              return (
                <li
                  key={player.id}
                  className={`bb-wall__tile${isEliminated ? ' bb-wall__tile--eliminated' : ''}`}
                  aria-label={`${player.name}: ${isEliminated ? 'eliminated' : `${pct}%`}`}
                >
                  <div className="bb-wall__ring-wrap">
                    <svg className="bb-wall__ring-svg" viewBox="0 0 76 76" aria-hidden="true">
                      {/* Track */}
                      <circle cx={RING_CX} cy={RING_CY} r={RING_R} fill="none" stroke={RING_TRACK_COLOR} strokeWidth={RING_STROKE} />
                      {/* Vote gauge */}
                      {!isEliminated && (
                        <circle
                          cx={RING_CX} cy={RING_CY} r={RING_R}
                          fill="none"
                          stroke="#f97316"
                          strokeWidth={RING_STROKE}
                          strokeDasharray={RING_CIRC}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="round"
                          transform={`rotate(-90 ${RING_CX} ${RING_CY})`}
                          style={{ transition: 'stroke-dashoffset 0.35s ease' }}
                        />
                      )}
                    </svg>
                    <img
                      src={resolveAvatar(player)}
                      alt={player.name}
                      className="bb-wall__avatar"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    {isEliminated && (
                      <div className="bb-wall__elim-stamp" aria-hidden="true">ELIM<br />INATED</div>
                    )}
                  </div>
                  <span className="bb-wall__tile-name">{player.name}</span>
                  {!isEliminated && <span className="bb-wall__tile-pct">{pct}%</span>}
                </li>
              );
            })}
          </ul>

          {/* Countdown footer */}
          <div className="bb-wall__footer" aria-live="polite">
            <span className="bb-wall__footer-text">
              {isComplete
                ? '🏆 Winner found!'
                : countdown === 0
                  ? '⚡ ELIMINATING…'
                  : `⚡ NEXT ELIMINATION IN ${countdown}…`}
            </span>
          </div>
        </div>
      )}

      {/* ── Step 4: Winner ───────────────────────────────────────────────── */}
      {step === 'winner' && winnerId && (
        <div
          className="bb-overlay__card bb-overlay__card--winner"
          onClick={handleClose}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClose()}
          aria-label="Battle Back winner — tap to continue"
        >
          {(() => {
            const winner = candidates.find((c) => c.id === winnerId);
            if (!winner) {
              // Defensive: winner not found in candidates — should not occur in normal flow.
              console.warn('[BattleBackOverlay] Winner ID not found in candidates:', winnerId);
            }
            return (
              <>
                <div className="bb-overlay__winner-avatar" aria-hidden="true">
                  <img
                    src={resolveAvatar(winner ?? { id: winnerId, name: '', avatar: '' })}
                    alt={winner?.name ?? ''}
                    className="bb-overlay__winner-img"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <p className="bb-overlay__label">BATTLE BACK WINNER</p>
                <h1 className="bb-overlay__title">{winner?.name ?? 'A Juror'}</h1>
                <p className="bb-overlay__winner-msg">
                  🏠 Returns to the Big Brother house!
                </p>
                <p className="bb-overlay__tap-hint">tap to continue</p>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
