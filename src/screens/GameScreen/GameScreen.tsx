import { useState } from 'react';
import { useGame } from '../../store/GameContext';
import TvZone from '../../components/ui/TvZone';
import PlayerAvatar from '../../components/ui/PlayerAvatar';
import type { Player } from '../../types';
import './GameScreen.css';

/**
 * GameScreen — main gameplay view.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │  TvZone (TV action area) │
 *   ├─────────────────────────┤
 *   │  PlayerRoster (avatars)  │
 *   │  [Evicted drawer]        │
 *   └─────────────────────────┘
 *
 * Interactions:
 *   - Tap avatar → shows popover with stats
 *   - Evicted section collapses by default
 *
 * To extend: add new sections between TvZone and the roster,
 * or add action buttons by dispatching events via useGame().
 */
export default function GameScreen() {
  const { alivePlayers, evictedPlayers, addTvEvent } = useGame();
  const [evictedOpen, setEvictedOpen] = useState(false);

  function handleAvatarSelect(player: Player) {
    // Demo: log selection to TV feed when you tap your own avatar
    if (player.isUser) {
      addTvEvent({ text: `${player.name} checks their alliance status 🤫`, type: 'diary' });
    }
  }

  return (
    <div className="game-screen">
      <TvZone />

      {/* ── Alive roster ──────────────────────────────────────────────── */}
      <section className="game-screen__roster" aria-label="Active houseguests">
        <h2 className="game-screen__section-title">
          Houseguests <span className="game-screen__count">({alivePlayers.length})</span>
        </h2>
        <div className="game-screen__grid">
          {alivePlayers.map((p) => (
            <PlayerAvatar key={p.id} player={p} onSelect={handleAvatarSelect} size="md" />
          ))}
        </div>
      </section>

      {/* ── Evicted drawer ────────────────────────────────────────────── */}
      {evictedPlayers.length > 0 && (
        <section className="game-screen__evicted" aria-label="Evicted players">
          <button
            className="game-screen__evicted-toggle"
            onClick={() => setEvictedOpen((v) => !v)}
            aria-expanded={evictedOpen}
            type="button"
          >
            <span>🚪 Evicted / Jury ({evictedPlayers.length})</span>
            <span className="game-screen__evicted-caret" aria-hidden="true">
              {evictedOpen ? '▲' : '▼'}
            </span>
          </button>

          {evictedOpen && (
            <div className="game-screen__grid game-screen__grid--evicted">
              {evictedPlayers.map((p) => (
                <PlayerAvatar key={p.id} player={p} size="sm" />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
