import { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import { selectEnergyBank } from '../../social/socialSlice';
import ActionGrid from './ActionGrid';
import './SocialPanelV2.css';

/**
 * SocialPanelV2 — full-screen modal overlay for social phases.
 *
 * Visible during game.phase === 'social_1' | 'social_2' when a human player
 * exists. Provides the layout canvas for the interactive social UI; later PRs
 * will implement player cards, action cards, and execute flow.
 *
 * Features:
 *   - Backdrop + bottom-sheet modal
 *   - Header: energy chip for the human player + close button
 *   - Two-column body: Player roster (left) / Action grid (right) placeholders
 *   - Sticky footer: Execute button + cost display placeholders
 *   - Minimal internal open/closed state so DebugPanel phase changes re-open it
 *
 * Open/close logic: tracks which phase the user last dismissed. The modal is
 * visible whenever the current phase is a social phase AND differs from the
 * last-dismissed phase — no useEffect needed, making re-open on phase change
 * purely derived from state.
 */
export default function SocialPanelV2() {
  const game = useAppSelector((s) => s.game);
  const energyBank = useAppSelector(selectEnergyBank);

  const humanPlayer = game.players.find((p) => p.isUser);
  const isSocialPhase = game.phase === 'social_1' || game.phase === 'social_2';

  // Track which phase the user last closed. The modal is open whenever the
  // current phase is social and has not been explicitly closed by the user.
  // Transitioning to a new phase (e.g. social_1 → social_2) clears the closed
  // state automatically since game.phase no longer matches closedForPhase.
  const [closedForPhase, setClosedForPhase] = useState<string | null>(null);
  const open = isSocialPhase && !!humanPlayer && closedForPhase !== game.phase;

  if (!open) return null;

  const energy = energyBank?.[humanPlayer!.id] ?? 0;

  return (
    <div className="sp2-backdrop" role="dialog" aria-modal="true" aria-label="Social Phase">
      <div className="sp2-modal">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="sp2-header">
          <span className="sp2-header__title">💬 Social Phase</span>
          <div className="sp2-header__energy">
            <span
              className="sp2-energy-chip"
              aria-label={`Energy: ${energy}`}
            >
              ⚡ {energy}
            </span>
          </div>
          <button
            className="sp2-header__close"
            onClick={() => setClosedForPhase(game.phase)}
            type="button"
            aria-label="Close social panel"
          >
            ✕
          </button>
        </header>

        {/* ── Two-column body ──────────────────────────────────────────────── */}
        <div className="sp2-body">
          {/* Left column – Player roster placeholder */}
          <div className="sp2-column" aria-label="Player roster">
            <span className="sp2-column__label">Players</span>
            <div className="sp2-column__placeholder">
              Player cards coming soon
            </div>
          </div>

          {/* Right column – Action grid */}
          <div className="sp2-column" aria-label="Action grid">
            <span className="sp2-column__label">Actions</span>
            <ActionGrid />
          </div>
        </div>

        {/* ── Sticky bottom bar ────────────────────────────────────────────── */}
        <footer className="sp2-footer">
          <span className="sp2-footer__cost">Cost: —</span>
          <button
            className="sp2-footer__execute"
            type="button"
            disabled
          >
            Execute
          </button>
        </footer>
      </div>
    </div>
  );
}
