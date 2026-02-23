import { useState, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { selectEnergyBank } from '../../social/socialSlice';
import { SocialManeuvers } from '../../social/SocialManeuvers';
import ActionGrid from './ActionGrid';
import PlayerList from './PlayerList';
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
 *   - Two-column body: Player roster with PlayerList (left) / Action grid placeholder (right)
 *   - Sticky footer: Execute button + cost display placeholders
 *   - Minimal internal open/closed state so DebugPanel phase changes re-open it
 *
 * Open/close logic: tracks which phase the user last dismissed. The modal is
 * visible whenever the current phase is a social phase AND differs from the
 * last-dismissed phase — no useEffect needed, making re-open on phase change
 * purely derived from state.
 */
export default function SocialPanelV2() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const energyBank = useAppSelector(selectEnergyBank);
  const relationships = useAppSelector((s) => s.social?.relationships);

  const humanPlayer = game.players.find((p) => p.isUser);
  const isSocialPhase = game.phase === 'social_1' || game.phase === 'social_2';

  // Track which phase the user last closed. The modal is open whenever the
  // current phase is social and has not been explicitly closed by the user.
  // Transitioning to a new phase (e.g. social_1 → social_2) clears the closed
  // state automatically since game.phase no longer matches closedForPhase.
  const [closedForPhase, setClosedForPhase] = useState<string | null>(null);
  const open = isSocialPhase && !!humanPlayer && closedForPhase !== game.phase;

  // ── Execute flow state ────────────────────────────────────────────────────
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const handleSelectionChange = useCallback((ids: Set<string>) => {
    setSelectedTargets(Array.from(ids));
  }, []);

  if (!open) return null;

  const energy = energyBank?.[humanPlayer!.id] ?? 0;

  const selectedAction = selectedActionId ? SocialManeuvers.getActionById(selectedActionId) : null;
  const needsTargets = selectedAction?.needsTargets !== false;
  const canExecute = !executing && !!selectedActionId && (!needsTargets || selectedTargets.length > 0);

  const energyCost = selectedAction
    ? typeof selectedAction.baseCost === 'number'
      ? selectedAction.baseCost
      : (selectedAction.baseCost.energy ?? 0)
    : null;

  function handleExecute() {
    if (!canExecute || !humanPlayer || !selectedActionId) return;
    setExecuting(true);
    setFeedbackMsg(null);
    const targetId = selectedTargets[0] ?? humanPlayer.id;
    const result = SocialManeuvers.executeAction(humanPlayer.id, targetId, selectedActionId, { dispatch });
    setFeedbackMsg(result.summary);
    if (result.success) {
      setSelectedActionId(null);
      setSelectedTargets([]);
    }
    setExecuting(false);
  }

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
          {/* Left column – Player roster */}
          <div className="sp2-column" aria-label="Player roster">
            <span className="sp2-column__label">Players</span>
            <PlayerList
              players={game.players.filter((p) => !p.isUser)}
              humanPlayerId={humanPlayer!.id}
              relationships={relationships}
              selectedIds={new Set(selectedTargets)}
              onSelectionChange={handleSelectionChange}
            />
          </div>

          {/* Right column – Action grid */}
          <div className="sp2-column" aria-label="Action grid">
            <span className="sp2-column__label">Actions</span>
            <ActionGrid
              selectedId={selectedActionId}
              onActionClick={setSelectedActionId}
            />
          </div>
        </div>

        {/* ── Sticky bottom bar ────────────────────────────────────────────── */}
        <footer className="sp2-footer">
          {feedbackMsg ? (
            <span className="sp2-footer__feedback" role="status">{feedbackMsg}</span>
          ) : (
            <span className="sp2-footer__cost">
              {energyCost !== null ? `Cost: ⚡${energyCost}` : 'Cost: —'}
            </span>
          )}
          <button
            className="sp2-footer__execute"
            type="button"
            disabled={!canExecute}
            onClick={handleExecute}
          >
            {executing ? 'Executing…' : 'Execute'}
          </button>
        </footer>
      </div>
    </div>
  );
}
