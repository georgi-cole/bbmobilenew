/**
 * BattleBackOverlay — full-screen "Jury Return / Battle Back" competition overlay.
 *
 * UX flow (3 steps):
 *  1. info         — explanation card; tap to start the competition.
 *  2. competition  — spectator view: 3 minigame rounds reveal one at a time.
 *                    Winner determined by seeded RNG (deterministic).
 *  3. winner       — winner reveal with re-entry message; tap to close.
 *
 * Note: The step-1 announcement ("JURY RETURN!" full-screen splash) has been
 * moved to the TvZone TV filler, triggered by the 'twist' major event
 * pushed in `activateBattleBack`. This overlay opens ~5 s after that announcement.
 *
 * Props:
 *  candidates         — Player objects eligible to compete (all current jurors).
 *  seed               — Seeded RNG value for reproducible, deterministic outcomes.
 *  progressIntervalMs — Time between round reveals (ms). Default: 3500.
 *  onComplete         — Called with the winning player ID when the overlay closes.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Player } from '../../types';
import { simulateBattleBackCompetition } from '../../features/twists/battleBackCompetition';
import { resolveAvatar } from '../../utils/avatar';
import './BattleBackOverlay.css';

interface Props {
  candidates: Player[];
  seed: number;
  /** Override the round-reveal interval (ms). Default: 3500. Useful for QA slow-mode. */
  progressIntervalMs?: number;
  onComplete: (winnerId: string) => void;
}

type Step = 'info' | 'competition' | 'winner';

const PROGRESS_INTERVAL_MS = 3500;
const TICKER_MSG = 'Jurors compete in a best-of-3 challenge — one will return to the house! ✦  ';

export default function BattleBackOverlay({
  candidates,
  seed,
  progressIntervalMs = PROGRESS_INTERVAL_MS,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>('info');
  const [revealedRounds, setRevealedRounds] = useState(0);
  const firedRef = useRef(false);

  // Compute competition result once (deterministic — same seed always same result).
  const result = useMemo(
    () => simulateBattleBackCompetition(candidates.map((c) => c.id), seed),
    [candidates, seed],
  );

  // Reveal rounds one at a time during the competition step.
  useEffect(() => {
    if (step !== 'competition') return;
    if (revealedRounds >= result.rounds.length) return;
    const id = setTimeout(
      () => setRevealedRounds((prev) => prev + 1),
      progressIntervalMs,
    );
    return () => clearTimeout(id);
  }, [step, revealedRounds, result.rounds.length, progressIntervalMs]);

  // Advance to winner step once all rounds have been revealed.
  useEffect(() => {
    if (step !== 'competition') return;
    if (revealedRounds < result.rounds.length) return;
    if (result.rounds.length === 0) return;
    const id = setTimeout(() => setStep('winner'), Math.round(progressIntervalMs * 0.6));
    return () => clearTimeout(id);
  }, [step, revealedRounds, result.rounds.length, progressIntervalMs]);

  const winner = candidates.find((c) => c.id === result.winnerId);

  function startCompetition() {
    setRevealedRounds(0);
    // If there are no rounds (single-candidate edge case), skip straight to winner.
    if (result.rounds.length === 0) {
      setStep('winner');
    } else {
      setStep('competition');
    }
  }

  const handleClose = () => {
    if (firedRef.current || !result.winnerId) return;
    firedRef.current = true;
    onComplete(result.winnerId);
  };

  return (
    <div
      className="bb-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Battle Back competition overlay"
    >
      <div className="bb-overlay__dim" />

      {/* ── Step 1: Info ─────────────────────────────────────────────────── */}
      {step === 'info' && (
        <div
          className="bb-overlay__card bb-overlay__card--info"
          onClick={startCompetition}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && startCompetition()}
          aria-label="Battle Back competition info — tap to watch"
        >
          <div className="bb-overlay__emoji" aria-hidden="true">🏆</div>
          <h2 className="bb-overlay__title bb-overlay__title--md">Battle Back</h2>
          <ul className="bb-overlay__info-list" role="list">
            <li>The evicted jurors compete in a best-of-3 challenge.</li>
            <li>Three minigame rounds decide who has what it takes to return.</li>
            <li>The competition winner re-enters the Big Brother house!</li>
          </ul>
          <p className="bb-overlay__tap-hint">tap to watch the competition</p>
        </div>
      )}

      {/* ── Step 2: Competition Spectator ────────────────────────────────── */}
      {step === 'competition' && (
        <div className="bb-wall" role="region" aria-label="Live Battle Back competition">

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

          {/* Round scorecards */}
          <div className="bb-comp__rounds" aria-label="Competition rounds">
            {result.rounds.map((round, i) => {
              const revealed = i < revealedRounds;
              const roundWinner = revealed
                ? candidates.find((c) => c.id === round.winnerId)
                : null;
              return (
                <div
                  key={i}
                  className={`bb-comp__round${revealed ? ' bb-comp__round--revealed' : ''}`}
                >
                  <span className="bb-comp__round-num">Round {i + 1}</span>
                  <span className="bb-comp__round-game">
                    {round.icon} {round.name}
                  </span>
                  <span className="bb-comp__round-winner">
                    {revealed ? (roundWinner?.name ?? '?') : '…'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Competitor grid with star tallies */}
          <ul className="bb-wall__grid" role="list">
            {candidates.map((player) => {
              const wins =
                result.rounds
                  .slice(0, revealedRounds)
                  .filter((r) => r.winnerId === player.id).length;
              return (
                <li
                  key={player.id}
                  className="bb-wall__tile"
                  aria-label={`${player.name}: ${wins} win${wins !== 1 ? 's' : ''}`}
                >
                  <div className="bb-wall__ring-wrap">
                    <img
                      src={resolveAvatar(player)}
                      alt={player.name}
                      className="bb-wall__avatar"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                  <span className="bb-wall__tile-name">{player.name}</span>
                  <span className="bb-comp__wins" aria-hidden="true">
                    {wins > 0
                      ? Array.from({ length: wins }, (_, k) => (
                          <span key={k} className="bb-comp__win-dot">★</span>
                        ))
                      : <span className="bb-comp__win-empty">–</span>}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Status footer */}
          <div className="bb-wall__footer" aria-live="polite">
            <span className="bb-wall__footer-text">
              {revealedRounds === 0
                ? '⚡ COMPETITION BEGINS…'
                : revealedRounds < result.rounds.length
                  ? `⚡ ROUND ${revealedRounds} COMPLETE — NEXT UP…`
                  : '🏆 ALL ROUNDS COMPLETE!'}
            </span>
          </div>
        </div>
      )}

      {/* ── Step 3: Winner ───────────────────────────────────────────────── */}
      {step === 'winner' && result.winnerId && (
        <div
          className="bb-overlay__card bb-overlay__card--winner"
          onClick={handleClose}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClose()}
          aria-label="Battle Back winner — tap to continue"
        >
          <div className="bb-overlay__winner-avatar" aria-hidden="true">
            <img
              src={resolveAvatar(winner ?? { id: result.winnerId, name: '', avatar: '' })}
              alt={winner?.name ?? ''}
              className="bb-overlay__winner-img"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <p className="bb-overlay__label">BATTLE BACK WINNER</p>
          <h1 className="bb-overlay__title">{winner?.name ?? 'A Juror'}</h1>
          <p className="bb-overlay__winner-msg">🏠 Returns to the Big Brother house!</p>
          {result.rounds.length > 0 && (
            <p className="bb-overlay__winner-record">
              {result.roundWins[result.winnerId]} / {result.rounds.length} rounds won
            </p>
          )}
          <p className="bb-overlay__tap-hint">tap to continue</p>
        </div>
      )}
    </div>
  );
}

