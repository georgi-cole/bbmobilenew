// MODULE: src/components/MinigameHost/MinigameHost.tsx
// Full-screen host for legacy minigames.
//
// Flow:
//   1. Rules modal  (unless skipRules is true)
//   2. 3-second "Get Ready" countdown
//   3. Legacy minigame (via LegacyMinigameWrapper)
//   4. Results screen  → calls onDone(rawValue)

import { useState, useEffect, useCallback } from 'react';
import type { GameRegistryEntry } from '../../minigames/registry';
import MinigameRules from '../MinigameRules/MinigameRules';
import LegacyMinigameWrapper from '../../minigames/LegacyMinigameWrapper';
import type { LegacyRawResult } from '../../minigames/LegacyMinigameWrapper';
import './MinigameHost.css';

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

type HostPhase = 'rules' | 'countdown' | 'playing' | 'results';

// ─── Component ────────────────────────────────────────────────────────────────

export default function MinigameHost({
  game,
  gameOptions = {},
  onDone,
  skipRules = false,
  skipCountdown = false,
}: Props) {
  const [phase, setPhase] = useState<HostPhase>(skipRules ? 'countdown' : 'rules');
  const [countdown, setCountdown] = useState(3);
  const [finalValue, setFinalValue] = useState<number | null>(null);
  const [wasPartial, setWasPartial] = useState(false);

  // ── Rules confirmed ─────────────────────────────────────────────────────
  const handleRulesConfirm = useCallback(() => {
    setPhase('countdown');
  }, []);

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

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="minigame-host" role="dialog" aria-modal="true" aria-label={`${game.title} minigame`}>
      {phase === 'rules' && (
        <MinigameRules
          game={game}
          onConfirm={handleRulesConfirm}
          onSkip={handleRulesConfirm}
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
          <p className="minigame-host-results-score">
            {game.metricLabel}: <strong>{finalValue ?? 0}</strong>
            {wasPartial && ' (partial)'}
          </p>
          <button className="minigame-host-results-btn" onClick={handleContinue} autoFocus>
            Continue ▶
          </button>
        </div>
      )}
    </div>
  );
}
