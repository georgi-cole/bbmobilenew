import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  selectEnergyBank,
  selectInfluenceBank,
  selectInfoBank,
  selectSocialPanelOpen,
  selectSessionLogs,
  closeSocialPanel,
  clearSessionLogs,
} from '../../social/socialSlice';
import { addTvEvent } from '../../store/gameSlice';
import { SocialManeuvers } from '../../social/SocialManeuvers';
import ActionGrid from './ActionGrid';
import PlayerList from './PlayerList';
import RecentActivity from './RecentActivity';
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
 *   - FAB-driven open/close; panel does not auto-open on phase changes
 *
 * Open/close logic: opens exclusively when socialPanelOpen (Redux) is true,
 * which is set by the FAB 💬 button. The social engine continues to run in
 * the background; the panel simply won't auto-open anymore.
 */
export default function SocialPanelV2() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const energyBank = useAppSelector(selectEnergyBank);
  const influenceBank = useAppSelector(selectInfluenceBank);
  const infoBank = useAppSelector(selectInfoBank);
  const socialPanelOpen = useAppSelector(selectSocialPanelOpen);
  const sessionLogs = useAppSelector(selectSessionLogs);
  const relationships = useAppSelector((s) => s.social?.relationships);

  const humanPlayer = game.players.find((p) => p.isUser);

  // Panel opens exclusively when the FAB dispatches openSocialPanel().
  const open = !!humanPlayer && socialPanelOpen;

  function handleClose() {
    // Export any accumulated session logs as one consolidated Diary Room entry.
    if (sessionLogs.length > 0) {
      const playerNames = new Map(game.players.map((p) => [p.id, p.name]));
      const lines = sessionLogs.map((log) => {
        const actor = playerNames.get(log.actorId) ?? log.actorId;
        const target = playerNames.get(log.targetId) ?? log.targetId;
        const actionTitle = SocialManeuvers.getActionById(log.actionId)?.title ?? log.actionId;
        return `${actor} → ${target}: ${actionTitle} (${log.outcome})`;
      });
      const text = `📖 Social recap — Week ${game.week}: ${lines.join(' | ')}`;
      dispatch(addTvEvent({ text, type: 'diary' }));
      dispatch(clearSessionLogs());
    }
    dispatch(closeSocialPanel());
  }

  // ── Execute flow state ────────────────────────────────────────────────────
  // Single-target selection: only the most-recently clicked player is kept.
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [successPulse, setSuccessPulse] = useState(false);
  const successPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Re-entrancy guard: prevents double-execution on rapid clicks (synchronous
  // state updates are batched and `executing` state may not be visible yet).
  const isExecutingRef = useRef(false);

  // Clean up the success pulse timer on unmount.
  useEffect(() => () => {
    if (successPulseTimerRef.current !== null) clearTimeout(successPulseTimerRef.current);
  }, []);

  // Derived — computed before the early return so all hooks remain unconditional.
  const selectedAction = selectedActionId ? SocialManeuvers.getActionById(selectedActionId) : null;
  const needsTargets = selectedAction?.needsTargets !== false;
  const canExecute = !!selectedActionId && (!needsTargets || selectedTarget !== null);

  // Enforce single-selection: take only the last selected player.
  const handleSelectionChange = useCallback((ids: Set<string>) => {
    const arr = Array.from(ids);
    setSelectedTarget(arr[arr.length - 1] ?? null);
  }, []);

  const handleExecute = useCallback(() => {
    if (!canExecute || !humanPlayer || !selectedActionId || isExecutingRef.current) return;
    isExecutingRef.current = true;
    setFeedbackMsg(null);
    // For targetless actions (needsTargets: false), fall back to the human player's
    // own id so executeAction always receives a valid string.
    const targetId = selectedTarget ?? humanPlayer.id;
    const result = SocialManeuvers.executeAction(humanPlayer.id, targetId, selectedActionId);
    setFeedbackMsg(result.summary);
    if (result.success) {
      setSelectedActionId(null);
      setSelectedTarget(null);
      setSuccessPulse(true);
      if (successPulseTimerRef.current !== null) clearTimeout(successPulseTimerRef.current);
      successPulseTimerRef.current = setTimeout(() => {
        setSuccessPulse(false);
        successPulseTimerRef.current = null;
      }, 850);
    }
    isExecutingRef.current = false;
  }, [canExecute, humanPlayer, selectedActionId, selectedTarget]);

  if (!open) return null;

  const energy = energyBank?.[humanPlayer!.id] ?? 0;
  const influence = influenceBank?.[humanPlayer!.id] ?? 0;
  const info = infoBank?.[humanPlayer!.id] ?? 0;
  const energyCost = selectedAction
    ? SocialManeuvers.computeActionCost(humanPlayer!.id, selectedAction, selectedTarget ?? humanPlayer!.id)
    : null;

  return (
    <div className="sp2-backdrop" role="dialog" aria-modal="true" aria-label="Social Phase">
      <div className="sp2-modal">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="sp2-header">
          <span className="sp2-header__title">💬 Social Phase</span>
          <div className="sp2-header__resources">
            <span
              className="sp2-energy-chip"
              aria-label={`Energy: ${energy}`}
            >
              ⚡ {energy}
            </span>
            <span
              className="sp2-resource-chip sp2-resource-chip--influence"
              aria-label={`Influence: ${influence}`}
            >
              🤝 {influence}
            </span>
            <span
              className="sp2-resource-chip sp2-resource-chip--info"
              aria-label={`Info: ${info}`}
            >
              💡 {info}
            </span>
          </div>
          <button
            className="sp2-header__close"
            onClick={handleClose}
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
              selectedIds={selectedTarget ? new Set([selectedTarget]) : new Set()}
              onSelectionChange={handleSelectionChange}
            />
          </div>

          {/* Right column – Action grid */}
          <div className="sp2-column" aria-label="Action grid">
            <span className="sp2-column__label">Actions</span>
            <ActionGrid
              selectedId={selectedActionId}
              onActionClick={setSelectedActionId}
              selectedTargetIds={selectedTarget ? new Set([selectedTarget]) : undefined}
              players={game.players.filter((p) => !p.isUser)}
              actorId={humanPlayer!.id}
              actorEnergy={energy}
              relationships={relationships}
            />
          </div>
        </div>

        {/* ── Recent Activity – compact fixed-height log above footer ─────── */}
        <div className="sp2-recent" aria-label="Recent Activity log">
          <RecentActivity players={game.players.filter((p) => !p.isUser)} />
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
            className={`sp2-footer__execute${successPulse ? ' sp2-footer__execute--pulse' : ''}`}
            type="button"
            disabled={!canExecute}
            onClick={handleExecute}
          >
            Execute
          </button>
        </footer>
      </div>
    </div>
  );
}
