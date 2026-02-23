// MODULE: src/components/MinigameHost/MinigameHost.tsx
// Full-screen host for legacy minigames.
//
// Flow:
//   1. Rules modal  (unless skipRules is true)
//   2. 3-second "Get Ready" countdown
//   3. Legacy minigame (via LegacyMinigameWrapper)
//   4. Results screen  → calls onDone(rawValue)

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GameRegistryEntry } from '../../minigames/registry';
import MinigameRules from '../MinigameRules/MinigameRules';
import LegacyMinigameWrapper from '../../minigames/LegacyMinigameWrapper';
import type { LegacyRawResult } from '../../minigames/LegacyMinigameWrapper';
import './MinigameHost.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MinigameParticipant {
  id: string;
  name: string;
  isHuman: boolean;
  /** Pre-computed raw score for AI players; ignored for the human (finalValue is used). */
  precomputedScore: number;
  /** Previous personal-record value for this game, using the game's native metric
   * (same units/scale as the raw rounded game score). Null = no prior record. */
  previousPR: number | null;
}

interface Props {
  game: GameRegistryEntry;
  /** Options forwarded to the legacy module (e.g. seed, timeLimit). */
  gameOptions?: Record<string, unknown>;
  /**
   * Called when the minigame ends (normally or via quit).
   * rawValue is the primary metric reported by the game.
   */
  onDone: (rawValue: number, partial?: boolean) => void;
  /** When true the rules modal is skipped and countdown starts immediately. */
  skipRules?: boolean;
  /** When true the 3-second countdown is skipped (for testing). */
  skipCountdown?: boolean;
  /**
   * All competition participants (human + AI).  When provided, the results
   * screen shows a full ranked leaderboard instead of the human's score alone.
   */
  participants?: MinigameParticipant[];
}

type HostPhase = 'rules' | 'countdown' | 'playing' | 'results';

const MEDALS = ['🥇', '🥈', '🥉'];

/** Round a raw game score to an integer for display. */
function fmtScore(value: number): string {
  return String(Math.round(value));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MinigameHost({
  game,
  gameOptions = {},
  onDone,
  skipRules = false,
  skipCountdown = false,
  participants,
}: Props) {
  const [phase, setPhase] = useState<HostPhase>(skipRules ? 'countdown' : 'rules');
  const [countdown, setCountdown] = useState(3);
  const [finalValue, setFinalValue] = useState<number | null>(null);
  const [wasPartial, setWasPartial] = useState(false);

  // ── Rules confirmed ─────────────────────────────────────────────────────
  const handleRulesConfirm = useCallback(() => {
    setPhase('countdown');
  }, []);

  // ── Dismiss challenge from rules (score 0) ───────────────────────────────
  const handleRulesDismiss = useCallback(() => {
    onDone(0, true);
  }, [onDone]);

  // ── Countdown ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (skipCountdown) {
      const t = setTimeout(() => setPhase('playing'), 0);
      return () => clearTimeout(t);
    }
    if (countdown <= 0) {
      // Show "GO!" briefly then start
      const t = setTimeout(() => setPhase('playing'), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown, skipCountdown]);

  // ── Game complete ────────────────────────────────────────────────────────
  const handleComplete = useCallback((result: LegacyRawResult) => {
    setFinalValue(result.value);
    setWasPartial(false);
    setPhase('results');
  }, []);

  // ── Quit / partial ───────────────────────────────────────────────────────
  const handleQuit = useCallback((partial: LegacyRawResult) => {
    setFinalValue(partial.value);
    setWasPartial(true);
    setPhase('results');
  }, []);

  // ── Continue from results ────────────────────────────────────────────────
  const handleContinue = useCallback(() => {
    onDone(finalValue ?? 0, wasPartial);
  }, [onDone, finalValue, wasPartial]);

  // ── Build leaderboard when participants are provided ─────────────────────
  const leaderboard = useMemo(() => {
    if (!participants || participants.length === 0) return null;
    const humanScore = finalValue ?? 0;
    const lowerBetter = game.scoringAdapter === 'lowerBetter';
    const entries = participants.map((p) => {
      const score = p.isHuman ? humanScore : p.precomputedScore;
      const isPR =
        p.previousPR === null ||
        (lowerBetter ? score < p.previousPR : score > p.previousPR);
      return { ...p, score, isPR };
    });
    // Sort: lower-is-better adapters sort ascending; all others sort descending.
    entries.sort((a, b) => (lowerBetter ? a.score - b.score : b.score - a.score));
    return entries;
  }, [participants, finalValue, game.scoringAdapter]);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="minigame-host" role="dialog" aria-modal="true" aria-label={`${game.title} minigame`}>
      {phase === 'rules' && (
        <MinigameRules
          game={game}
          onConfirm={handleRulesConfirm}
          onSkip={skipRules ? handleRulesConfirm : undefined}
          onDismiss={handleRulesDismiss}
        />
      )}

      {phase === 'countdown' && (
        <div className="minigame-host-ready">
          <span className="minigame-host-ready-label">Get Ready</span>
          <span className="minigame-host-ready-game">{game.title}</span>
          {countdown > 0 ? (
            <span className="minigame-host-ready-count" key={countdown}>
              {countdown}
            </span>
          ) : (
            <span className="minigame-host-ready-go">GO!</span>
          )}
        </div>
      )}

      {phase === 'playing' && (
        <div className="minigame-host-playing">
          <LegacyMinigameWrapper
            game={game}
            options={gameOptions}
            onComplete={handleComplete}
            onQuit={handleQuit}
          />
        </div>
      )}

      {phase === 'results' && (
        <div className="minigame-host-results">
          <h2 className="minigame-host-results-title">
            {wasPartial ? '🚪 Exited Early' : '🏁 Finished!'}
          </h2>

          {leaderboard ? (
            <>
              <p className="minigame-host-results-winner">
                🏆 {leaderboard[0]?.name ?? 'Unknown'} wins
                {leaderboard[0]?.isHuman ? " — that's you!" : '!'}
              </p>
              <ol className="minigame-host-leaderboard">
                {leaderboard.map((entry, i) => (
                  <li
                    key={entry.id}
                    className={[
                      'minigame-host-leaderboard-entry',
                      entry.isHuman ? 'minigame-host-leaderboard-entry--you' : '',
                      i === 0 ? 'minigame-host-leaderboard-entry--winner' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="minigame-host-leaderboard-rank" aria-hidden="true">
                      {MEDALS[i] ?? `${i + 1}.`}
                    </span>
                    <span className="minigame-host-leaderboard-name">
                      {entry.name}
                      {entry.isHuman && (
                        <span className="minigame-host-leaderboard-you"> (You)</span>
                      )}
                    </span>
                    <span className="minigame-host-leaderboard-score">
                      {game.metricLabel}: <strong>{fmtScore(entry.score)}</strong>
                      {entry.isPR && (
                        <span className="minigame-host-leaderboard-pr" title="Personal Record!">
                          {' '}🏅 PR
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="minigame-host-results-score">
              {game.metricLabel}: <strong>{fmtScore(finalValue ?? 0)}</strong>
              {wasPartial && ' (partial)'}
            </p>
          )}

          <button className="minigame-host-results-btn" onClick={handleContinue} autoFocus>
            Continue ▶
          </button>
        </div>
      )}
    </div>
  );
}
