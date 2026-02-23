// MODULE: src/components/MinigameRules/MinigameRules.tsx
// Modal that displays rules for a minigame before play begins.
// Shown by MinigameHost before the 3-second "Get Ready" countdown.

import type { GameRegistryEntry } from '../../minigames/registry';
import './MinigameRules.css';

interface Props {
  game: GameRegistryEntry;
  /** Called when the player taps "Let's Go!" to start the game. */
  onConfirm: () => void;
  /**
   * Optional callback for skipping the rules modal.
   * When provided a "Skip rules" link is shown (used by debug controls).
   */
  onSkip?: () => void;
  /**
   * Optional callback for dismissing the challenge entirely.
   * When provided an ✕ button is shown in the upper-right corner.
   * The player is assigned 0 points automatically.
   */
  onDismiss?: () => void;
}

const CATEGORY_EMOJI: Record<string, string> = {
  arcade: '🕹️',
  endurance: '💪',
  logic: '🧠',
  trivia: '❓',
};

function formatTime(ms: number): string {
  if (ms === 0) return 'No limit';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ''}`.trim();
}

export default function MinigameRules({ game, onConfirm, onSkip, onDismiss }: Props) {
  const emoji = CATEGORY_EMOJI[game.category] ?? '🎮';

  return (
    <div className="minigame-rules-overlay" role="dialog" aria-modal="true" aria-label={`${game.title} rules`}>
      <div className="minigame-rules-modal">
        {onDismiss && (
          <button
            className="minigame-rules-btn-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss challenge (score 0)"
            title="Dismiss — score 0 points"
          >
            ✕
          </button>
        )}
        <h2 className="minigame-rules-title">
          {emoji} {game.title}
        </h2>
        <p className="minigame-rules-description">{game.description}</p>

        <div className="minigame-rules-meta">
          <span>⏱ {formatTime(game.timeLimitMs)}</span>
          <span>📊 {game.metricLabel}</span>
          <span>🏷️ {game.category}</span>
        </div>

        <p className="minigame-rules-section-title">How to Play</p>
        <ul className="minigame-rules-list">
          {game.instructions.map((instr, i) => (
            <li key={i}>{instr}</li>
          ))}
        </ul>

        <div className="minigame-rules-actions">
          <button className="minigame-rules-btn-start" onClick={onConfirm} autoFocus>
            Let&apos;s Go! 🚀
          </button>
          {onSkip && (
            <button className="minigame-rules-btn-skip" onClick={onSkip}>
              Skip rules
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
