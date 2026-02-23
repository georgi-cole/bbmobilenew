import { useEffect, useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import { selectEnergyBank } from '../../social/socialSlice';
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
 */
export default function SocialPanelV2() {
  const game = useAppSelector((s) => s.game);
  const energyBank = useAppSelector(selectEnergyBank);

  const humanPlayer = game.players.find((p) => p.isUser);
  const isSocialPhase = game.phase === 'social_1' || game.phase === 'social_2';

  // Auto-open whenever we enter a social phase so the DebugPanel can trigger it.
  const [open, setOpen] = useState(isSocialPhase && !!humanPlayer);
  useEffect(() => {
    if (isSocialPhase && humanPlayer) {
      setOpen(true);
    }
  }, [game.phase, humanPlayer]);

  if (!isSocialPhase || !humanPlayer || !open) return null;

  const energy = energyBank?.[humanPlayer.id] ?? 0;

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
            onClick={() => setOpen(false)}
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

          {/* Right column – Action grid placeholder */}
          <div className="sp2-column" aria-label="Action grid">
            <span className="sp2-column__label">Actions</span>
            <div className="sp2-column__placeholder">
              Action cards coming soon
            </div>
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
