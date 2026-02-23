import { useState } from 'react';
import { useAppSelector } from '../../store/hooks';
import { selectAlivePlayers } from '../../store/gameSlice';
import { selectEnergyBank } from '../../social/socialSlice';
import { getAvailableActions, executeAction } from '../../social/SocialManeuvers';
import './SocialPanel.css';

interface Props {
  /** ID of the human player performing actions. */
  actorId: string;
}

/**
 * SocialPanel — player-facing UI for executing social actions during social phases.
 *
 * Shows the current player's energy, a target selector, an action selector, and
 * an Execute button. After each action, an inline result message is displayed.
 */
export default function SocialPanel({ actorId }: Props) {
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const energyBank = useAppSelector(selectEnergyBank);
  const socialState = useAppSelector((s) => s.social);

  const energy = energyBank?.[actorId] ?? 0;
  const targets = alivePlayers.filter((p) => p.id !== actorId);
  const availableActions = socialState
    ? getAvailableActions(actorId, { social: socialState })
    : [];

  const [selectedTarget, setSelectedTarget] = useState('');
  const [selectedAction, setSelectedAction] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);

  function handleExecute() {
    if (!selectedTarget || !selectedAction) return;

    const result = executeAction(actorId, selectedTarget, selectedAction, { source: 'manual' });
    const actionDef = availableActions.find((a) => a.id === selectedAction);
    const targetName = targets.find((t) => t.id === selectedTarget)?.name ?? selectedTarget;

    if (result.success) {
      setLastResult(
        `✅ ${actionDef?.title ?? selectedAction} → ${targetName} (⚡ ${result.newEnergy} left)`,
      );
    } else {
      setLastResult('❌ Not enough energy for that action.');
    }

    setSelectedAction('');
    setSelectedTarget('');
  }

  return (
    <div className="social-panel" role="region" aria-label="Social Actions">
      <header className="social-panel__header">
        <span className="social-panel__title">💬 Social Actions</span>
        <span className="social-panel__energy" aria-label={`Energy: ${energy}`}>
          ⚡ {energy}
        </span>
      </header>

      <div className="social-panel__body">
        <div className="social-panel__selectors">
          <select
            className="social-panel__select"
            value={selectedTarget}
            onChange={(e) => setSelectedTarget(e.target.value)}
            aria-label="Select target"
          >
            <option value="">— Choose target —</option>
            {targets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            className="social-panel__select"
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            aria-label="Select action"
            disabled={availableActions.length === 0}
          >
            <option value="">— Choose action —</option>
            {availableActions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>

        <button
          className="social-panel__btn"
          onClick={handleExecute}
          disabled={!selectedTarget || !selectedAction}
          type="button"
        >
          Execute
        </button>

        {lastResult && (
          <p className="social-panel__result" role="status" aria-live="polite">
            {lastResult}
          </p>
        )}
      </div>
    </div>
  );
}
