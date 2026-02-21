import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  addTvEvent,
  advance,
  finalizeFinal4Eviction,
  selectAlivePlayers,
  selectEvictedPlayers,
  setReplacementNominee,
} from '../../store/gameSlice';
import TvZone from '../../components/ui/TvZone';
import PlayerAvatar from '../../components/ui/PlayerAvatar';
import TvDecisionModal from '../../components/TvDecisionModal/TvDecisionModal';
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
 * or add action buttons by dispatching events via useAppDispatch().
 */
export default function GameScreen() {
  const dispatch = useAppDispatch();
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const evictedPlayers = useAppSelector(selectEvictedPlayers);
  const game = useAppSelector((s) => s.game);
  const [evictedOpen, setEvictedOpen] = useState(false);

  function handleAvatarSelect(player: Player) {
    // Demo: log selection to TV feed when you tap your own avatar
    if (player.isUser) {
      dispatch(addTvEvent({ text: `${player.name} checks their alliance status 🤫`, type: 'diary' }));
    }
  }

  // ── Human HOH replacement picker ─────────────────────────────────────────
  // Shown when a nominee auto-saved themselves and the human HOH must pick a
  // replacement. The Continue button is hidden while this modal is open.
  const replacementNeeded = game.replacementNeeded === true;
  const humanPlayer = game.players.find((p) => p.isUser);
  const humanIsHoH = humanPlayer && game.hohId === humanPlayer.id;
  const showReplacementModal = replacementNeeded && humanIsHoH;

  const replacementOptions = alivePlayers.filter(
    (p) =>
      p.id !== game.hohId &&
      p.id !== game.povWinnerId &&
      !game.nomineeIds.includes(p.id),
  );

  // ── Final 4 human POV holder vote ────────────────────────────────────────
  // Shown when phase is final4_eviction and the human player is the POV holder.
  const humanIsPovHolder = humanPlayer && game.povWinnerId === humanPlayer.id;
  const showFinal4Modal =
    game.phase === 'final4_eviction' && humanIsPovHolder;

  const final4Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id));

  // Hide Continue button while waiting for human decision
  const awaitingHumanDecision = showReplacementModal || showFinal4Modal;

  return (
    <div className="game-screen">
      <TvZone />

      {/* ── Human HOH replacement picker ────────────────────────────────── */}
      {showReplacementModal && (
        <TvDecisionModal
          title="Name a Replacement Nominee"
          subtitle={`${humanPlayer!.name}, you must name a replacement nominee.`}
          options={replacementOptions}
          onSelect={(id) => dispatch(setReplacementNominee(id))}
        />
      )}

      {/* ── Final 4 eviction vote (human POV holder) ────────────────────── */}
      {showFinal4Modal && (
        <TvDecisionModal
          title="Final 4 — Cast Your Vote"
          subtitle={`${humanPlayer!.name}, you hold the sole vote to evict. Choose wisely.`}
          options={final4Options}
          onSelect={(id) => dispatch(finalizeFinal4Eviction(id))}
          danger
        />
      )}

      {/* ── Continue / Advance CTA ────────────────────────────────────────── */}
      {!awaitingHumanDecision && (
        <button
          className="game-screen__advance-btn"
          onClick={() => dispatch(advance())}
          type="button"
          aria-label="Advance to next phase"
        >
          Continue ▶
        </button>
      )}

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
