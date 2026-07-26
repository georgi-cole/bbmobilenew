// MODULE: src/components/MinigameRules/MinigameRules.tsx
// Shared rules modal shown before play and available again as an in-game reference.

import type { GameRegistryEntry } from '../../minigames/registry';
import './MinigameRules.css';

interface Props {
  game: GameRegistryEntry;
  /** Called when the player starts or returns to the competition. */
  onConfirm: () => void;
  /** Optional debug-only rules bypass. */
  onSkip?: () => void;
  /** Custom primary-action label for intro/reference contexts. */
  confirmLabel?: string;
  /** Reference mode is used when the player reopens rules during a competition. */
  mode?: 'intro' | 'reference';
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

export default function MinigameRules({
  game,
  onConfirm,
  onSkip,
  confirmLabel,
  mode = 'intro',
}: Props) {
  const emoji = CATEGORY_EMOJI[game.category] ?? '🎮';
  const isReference = mode === 'reference';
  const primaryLabel = confirmLabel ?? (isReference ? 'Return to game' : 'Start competition');

  return (
    <div
      className="minigame-rules-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${game.title} rules`}
    >
      <div className={`minigame-rules-modal ${isReference ? 'minigame-rules-modal--reference' : ''}`}>
        <p className="minigame-rules-kicker">
          {isReference ? 'Quick reference' : 'Competition briefing'}
        </p>
        <h2 className="minigame-rules-title">
          {emoji} {game.title}
        </h2>
        <p className="minigame-rules-description">{game.description}</p>

        {!isReference && (
          <div className="minigame-rules-meta">
            <span>⏱ {formatTime(game.timeLimitMs)}</span>
            <span>📊 {game.metricLabel}</span>
            <span>🏷️ {game.category}</span>
          </div>
        )}

        <p className="minigame-rules-section-title">How to Play</p>
        <ul className="minigame-rules-list">
          {game.instructions.map((instr, i) => (
            <li key={i}>{instr}</li>
          ))}
        </ul>

        <div className="minigame-rules-actions">
          <button className="minigame-rules-btn-start" onClick={onConfirm} autoFocus>
            {primaryLabel}
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
