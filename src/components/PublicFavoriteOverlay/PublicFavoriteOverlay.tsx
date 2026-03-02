/**
 * PublicFavoriteOverlay — full-screen "Public's Favorite Player" voting overlay.
 *
 * UX flow (4 steps):
 *  1. announcement — purple full-screen splash; tap to continue.
 *  2. info         — explanation card; tap to start voting.
 *  3. voting       — live vote simulation: portrait list with vote bars,
 *                    scrolling ticker, countdown strip. Lowest candidate
 *                    eliminated every 3.5 s.
 *  4. winner       — winner reveal with gold glow; tap to close.
 *
 * Props:
 *  candidates   — Player objects eligible for the vote.
 *  seed         — Seeded RNG value for reproducible simulation.
 *  awardAmount  — Prize amount displayed in the winner step.
 *  onComplete   — Called with the winning player ID when the overlay closes.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Player } from '../../types';
import { useBattleBackVoting } from '../../hooks/useBattleBackVoting';
import { resolveAvatar } from '../../utils/avatar';
import './PublicFavoriteOverlay.css';

interface Props {
  candidates: Player[];
  seed: number;
  awardAmount?: number;
  onComplete: (winnerId: string) => void;
}

type Step = 'announcement' | 'info' | 'voting' | 'winner';

const ELIM_INTERVAL_MS = 3500;
const COUNTDOWN_START = Math.floor(ELIM_INTERVAL_MS / 1000);
const TICKER_MSG =
  "America is voting for their Favorite Player… One houseguest wins the grand prize! ✦  ";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PublicFavoriteOverlay({
  candidates,
  seed,
  awardAmount = 25000,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>('announcement');
  const firedRef = useRef(false);

  // Stable ID list avoids hook dep churn during a single session.
  const candidateIds = useMemo(() => candidates.map((c) => c.id), [candidates]);

  const { votes, eliminated, winnerId, isComplete } = useBattleBackVoting({
    candidates: candidateIds,
    seed,
    eliminationIntervalMs: ELIM_INTERVAL_MS,
    tickIntervalMs: 400,
  });

  // Countdown strip: resets after each elimination.
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

  // Derive winner step from isComplete.
  const displayStep = isComplete && step === 'voting' ? 'winner' : step;

  const handleClose = useCallback(() => {
    if (firedRef.current || !winnerId) return;
    firedRef.current = true;
    onComplete(winnerId);
  }, [winnerId, onComplete]);

  // Sort candidates: active first (by vote desc), eliminated last.
  const sortedCandidates = useMemo(() => {
    const active = candidates.filter((c) => !eliminated.includes(c.id))
      .sort((a, b) => (votes[b.id] ?? 0) - (votes[a.id] ?? 0));
    const elim = eliminated.map((id) => candidates.find((c) => c.id === id)).filter(Boolean) as Player[];
    return [...active, ...elim];
  }, [candidates, eliminated, votes]);

  const winnerPlayer = candidates.find((c) => c.id === winnerId);

  return (
    <div
      className="pf-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Public's Favorite Player overlay"
    >
      <div className="pf-overlay__dim" />

      {/* ── Step 1: Announcement ─────────────────────────────────────────── */}
      {displayStep === 'announcement' && (
        <div
          className="pf-overlay__card pf-overlay__card--announcement"
          onClick={() => setStep('info')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setStep('info')}
        >
          <p className="pf-overlay__eyebrow">America Decides</p>
          <h2 className="pf-overlay__headline">Public's<br />Favorite<br />Player</h2>
          <p className="pf-overlay__sub">
            The audience has been watching all season.
          </p>
          <p className="pf-overlay__tap-hint">Tap to continue →</p>
        </div>
      )}

      {/* ── Step 2: Info ─────────────────────────────────────────────────── */}
      {displayStep === 'info' && (
        <div
          className="pf-overlay__card pf-overlay__card--info"
          onClick={() => setStep('voting')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setStep('voting')}
        >
          <p className="pf-overlay__eyebrow">How it works</p>
          <h2 className="pf-overlay__headline" style={{ fontSize: '1.4rem' }}>
            America Votes
          </h2>
          <p className="pf-overlay__sub">
            All houseguests are eligible — including evicted players.<br />
            The lowest vote-getter is eliminated every few seconds until<br />
            one player wins {formatCurrency(awardAmount)} from America!
          </p>
          <p className="pf-overlay__tap-hint">Tap to watch the vote →</p>
        </div>
      )}

      {/* ── Step 3: Voting ───────────────────────────────────────────────── */}
      {displayStep === 'voting' && (
        <div className="pf-overlay__voting">
          <p className="pf-overlay__voting-title">🗳️ Live Public Vote</p>
          <p className="pf-overlay__voting-subtitle">
            Next elimination in {countdown}s
          </p>

          {/* Ticker */}
          <div className="pf-overlay__ticker-wrap" aria-hidden="true">
            <span className="pf-overlay__ticker">
              {TICKER_MSG + TICKER_MSG}
            </span>
          </div>

          {/* Candidate list */}
          <div className="pf-overlay__candidates" role="list">
            {sortedCandidates.map((candidate) => {
              const isElim = eliminated.includes(candidate.id);
              const pct = votes[candidate.id] ?? 0;
              return (
                <div
                  key={candidate.id}
                  className={`pf-overlay__candidate${isElim ? ' pf-overlay__candidate--eliminated' : ''}`}
                  role="listitem"
                  aria-label={`${candidate.name}: ${isElim ? 'eliminated' : `${pct}%`}`}
                >
                  <div
                    className={`pf-overlay__candidate-avatar${isElim ? ' pf-overlay__candidate-avatar--eliminated' : ''}`}
                  >
                    <img
                      src={resolveAvatar(candidate)}
                      alt={candidate.name}
                      className="pf-overlay__avatar-img"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  <div className="pf-overlay__candidate-info">
                    <p className="pf-overlay__candidate-name">{candidate.name}</p>
                    <p className="pf-overlay__candidate-pct">
                      {isElim ? 'Eliminated' : `${pct}%`}
                    </p>
                  </div>
                  {!isElim && (
                    <div className="pf-overlay__bar-track">
                      <div
                        className="pf-overlay__bar-fill"
                        style={{ width: `${pct}%` }}
                        role="meter"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 4: Winner ───────────────────────────────────────────────── */}
      {displayStep === 'winner' && (
        <div
          className="pf-overlay__card pf-overlay__card--winner"
          onClick={handleClose}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClose()}
        >
          <p className="pf-overlay__eyebrow">America's Favorite Player</p>
          <div className="pf-overlay__winner-avatar" aria-hidden="true">
            {winnerPlayer ? (
              <img
                src={resolveAvatar(winnerPlayer)}
                alt={winnerPlayer.name}
                className="pf-overlay__avatar-img pf-overlay__avatar-img--winner"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : '🏆'}
          </div>
          <h2 className="pf-overlay__headline">
            {winnerPlayer?.name ?? 'Unknown'}
          </h2>
          <p className="pf-overlay__winner-prize">
            Wins {formatCurrency(awardAmount)}!
          </p>
          <p className="pf-overlay__sub">Congratulations from America! 🎉</p>
          <p className="pf-overlay__tap-hint">Tap to close →</p>
        </div>
      )}
    </div>
  );
}
