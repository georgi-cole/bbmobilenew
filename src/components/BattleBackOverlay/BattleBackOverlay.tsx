/**
 * BattleBackOverlay — full-screen "Jury Return / Battle Back" twist overlay.
 *
 * UX flow (4 steps):
 *  1. announcement — orange full-screen splash; tap to continue.
 *  2. info         — explanation card; tap to start voting.
 *  3. voting       — live voting UI with candidate % bars; lowest eliminated
 *                    every 3.5 s via the useBattleBackVoting simulator.
 *  4. winner       — winner reveal with colour animation; tap to close.
 *
 * Props:
 *  candidates  — Player objects eligible to compete (all current jurors).
 *  seed        — Seeded RNG value for reproducible simulation.
 *  onComplete  — Called with the winning player ID when the overlay closes.
 */

import { useState, useEffect, useRef } from 'react';
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

export default function BattleBackOverlay({ candidates, seed, onComplete }: Props) {
  const [step, setStep] = useState<Step>('announcement');
  const firedRef = useRef(false);

  const { votes, eliminated, winnerId, isComplete } = useBattleBackVoting({
    candidates: candidates.map((c) => c.id),
    seed,
    eliminationIntervalMs: 3500,
    tickIntervalMs: 400,
  });

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
          onKeyDown={(e) => e.key === 'Enter' && setStep('info')}
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
          onKeyDown={(e) => e.key === 'Enter' && setStep('voting')}
          aria-label="Battle Back info — tap to start voting"
        >
          <div className="bb-overlay__emoji" aria-hidden="true">🏆</div>
          <h2 className="bb-overlay__title bb-overlay__title--md">How It Works</h2>
          <ul className="bb-overlay__info-list" role="list">
            <li>America votes for their favourite juror to return.</li>
            <li>The lowest-voted houseguest is eliminated every few seconds.</li>
            <li>The last juror standing wins and re-enters the house!</li>
          </ul>
          <p className="bb-overlay__tap-hint">tap to watch the vote live</p>
        </div>
      )}

      {/* ── Step 3: Live Voting ───────────────────────────────────────────── */}
      {step === 'voting' && (
        <div className="bb-overlay__voting" role="region" aria-label="Live Battle Back voting">
          <header className="bb-overlay__voting-header">
            <p className="bb-overlay__label">LIVE VOTE</p>
            <h2 className="bb-overlay__title bb-overlay__title--md">Battle Back</h2>
            <p className="bb-overlay__voting-subtitle">America is voting to save a juror…</p>
          </header>

          <ul className="bb-overlay__candidate-list" role="list">
            {candidates.map((player) => {
              const isEliminated = eliminated.includes(player.id);
              const pct = votes[player.id] ?? 0;
              return (
                <li
                  key={player.id}
                  className={`bb-overlay__candidate${isEliminated ? ' bb-overlay__candidate--eliminated' : ''}`}
                  aria-label={`${player.name}: ${isEliminated ? 'eliminated' : `${pct}%`}`}
                >
                  <div className="bb-overlay__candidate-avatar" aria-hidden="true">
                    <img
                      src={resolveAvatar(player)}
                      alt={player.name}
                      className="bb-overlay__avatar-img"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {isEliminated && (
                      <span className="bb-overlay__eliminated-cross" aria-hidden="true">✗</span>
                    )}
                  </div>
                  <div className="bb-overlay__candidate-info">
                    <span className="bb-overlay__candidate-name">{player.name}</span>
                    {isEliminated ? (
                      <span className="bb-overlay__candidate-status">eliminated</span>
                    ) : (
                      <div className="bb-overlay__bar-wrap" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div
                          className="bb-overlay__bar"
                          style={{ width: `${pct}%` }}
                        />
                        <span className="bb-overlay__pct">{pct}%</span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
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
