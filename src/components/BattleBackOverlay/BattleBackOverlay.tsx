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

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
const COUNTDOWN_START = Math.floor(ELIM_INTERVAL_MS / 1000);
/** Centre and radius of the SVG danger-zone ring (px inside a 76×76 viewBox). */
const RING_CX = 38;
const RING_CY = 38;
const RING_R = 34;
const RING_STROKE = 4;
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

  // Countdown strip: counts down from COUNTDOWN_START to 0.
  // Adding `eliminated.length` to deps re-starts the effect (and resets the
  // countdown) each time a candidate is eliminated.  The reset is scheduled
  // via setTimeout so setState is called from a callback, not the effect body.
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  useEffect(() => {
    if (step !== 'voting' || isComplete) return;
    const resetId = setTimeout(() => setCountdown(COUNTDOWN_START), 0);
    const id = setInterval(
      () => setCountdown((prev) => Math.max(0, prev - 1)),
      1000,
    );
    return () => {
      clearTimeout(resetId);
      clearInterval(id);
    };
  }, [step, isComplete, eliminated.length]);

  // Derive winner step from isComplete to avoid a setState-in-effect.
  const displayStep = (isComplete && step === 'voting') ? 'winner' : step;

  const handleClose = useCallback(() => {
    if (firedRef.current || !winnerId) return;
    firedRef.current = true;
    onComplete(winnerId);
  }, [winnerId, onComplete]);

  return (
    <div
      className="bb-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Battle Back twist overlay"
    >
      <div className="bb-overlay__dim" />

      {/* ── Step 1: Announcement ─────────────────────────────────────────── */}
      {displayStep === 'announcement' && (
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
      {displayStep === 'info' && (
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
      {displayStep === 'voting' && (
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
            {(() => {
              // Compute danger zone: the lowest-voted active candidates get a
              // red ring. Show 2 in danger when > 2 active remain; only 1 when
              // exactly 2 remain (the higher-voted one will be the winner).
              const active = candidates.filter(p => !eliminated.includes(p.id));
              let dangerCount: number;
              if (active.length > 2) {
                dangerCount = 2;
              } else if (active.length === 2) {
                dangerCount = 1;
              } else {
                dangerCount = 0;
              }
              const dangerIds = new Set(
                [...active]
                  .sort((a, b) => (votes[a.id] ?? 0) - (votes[b.id] ?? 0))
                  .slice(0, dangerCount)
                  .map(p => p.id)
              );
              return candidates.map((player) => {
                const isEliminated = eliminated.includes(player.id);
                const isDanger = dangerIds.has(player.id);
                const pct = isEliminated ? 0 : (votes[player.id] ?? 0);
                return (
                  <li
                    key={player.id}
                    className={`bb-wall__tile${isEliminated ? ' bb-wall__tile--eliminated' : ''}${isDanger ? ' bb-wall__tile--danger' : ''}`}
                    aria-label={`${player.name}: ${isEliminated ? 'gone' : `${pct}%`}`}
                  >
                    <div className="bb-wall__ring-wrap">
                      <svg className="bb-wall__ring-svg" viewBox="0 0 76 76" aria-hidden="true">
                        {/* Danger-zone ring: full circle, light red, pulsing */}
                        {isDanger && (
                          <circle
                            className="bb-wall__danger-ring"
                            cx={RING_CX} cy={RING_CY} r={RING_R}
                            fill="none"
                            stroke="#f87171"
                            strokeWidth={RING_STROKE}
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
                        <div className="bb-wall__elim-stamp" aria-hidden="true">GONE</div>
                      )}
                    </div>
                    <span className="bb-wall__tile-name">{player.name}</span>
                    {!isEliminated && <span className={`bb-wall__tile-pct${isDanger ? ' bb-wall__tile-pct--danger' : ''}`}>{pct}%</span>}
                  </li>
                );
              });
            })()}
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
      {displayStep === 'winner' && winnerId && (
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
