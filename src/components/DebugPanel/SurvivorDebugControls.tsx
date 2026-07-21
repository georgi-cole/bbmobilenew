import { useStore } from 'react-redux';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { clearSurvivorReplacementTransition, hydrateGame, simulateImmediateEliminationCycle } from '../../store/gameSlice';
import type { RootState } from '../../store/store';
import {
  createSurvivorRun,
  getSurvivorCurrentDay,
  isSurvivorRunTerminal,
  markSurvivorDay,
  terminalizeSurvivorRun,
} from '../../modes/survivorRun';

export default function SurvivorDebugControls() {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const game = useAppSelector((state) => state.game);

  const isSurvivorMode = game.mode === 'survival';
  const survivorState = game.modeSpecific?.kind === 'survival' ? game.modeSpecific : null;
  const currentDay = isSurvivorMode ? getSurvivorCurrentDay(game) : null;
  const isTerminal = isSurvivorMode ? isSurvivorRunTerminal(game) : false;
  const replacementTransition = survivorState?.replacementTransition ?? null;

  const handleStartRun = () => {
    dispatch(hydrateGame(createSurvivorRun()));
  };

  const handleAdvanceDay = () => {
    if (!isSurvivorMode) return;
    dispatch(simulateImmediateEliminationCycle());
    const advancedGame = store.getState().game;
    dispatch(hydrateGame(markSurvivorDay(advancedGame)));
  };

  const handleTerminalizeRun = () => {
    if (!isSurvivorMode) return;
    dispatch(hydrateGame(terminalizeSurvivorRun(game)));
  };

  const handleClearTransition = () => {
    dispatch(clearSurvivorReplacementTransition());
  };

  return (
    <section className="dbg-section">
      <h3 className="dbg-section__title">Surveyeval Debug</h3>

      <div className="dbg-row">
        <button className="dbg-btn dbg-btn--wide" onClick={handleStartRun}>
          Start Surveyeval Run
        </button>
      </div>

      <dl className="dbg-grid">
        <dt>Mode</dt>
        <dd>{isSurvivorMode ? 'survival' : 'classic'}</dd>
        <dt>Current Day</dt>
        <dd>{currentDay ?? 'n/a'}</dd>
        <dt>Best Day</dt>
        <dd>{survivorState?.bestDayReached ?? 'n/a'}</dd>
        <dt>Robo Evicted</dt>
        <dd>{survivorState?.totalRoboContestantsEvicted ?? 'n/a'}</dd>
        <dt>Replacement</dt>
        <dd>
          {replacementTransition
            ? `${replacementTransition.outgoingPlayerSnapshot.name} -> ${replacementTransition.incomingPlayerId}`
            : 'n/a'}
        </dd>
      </dl>

      <div className="dbg-row">
        <button
          className="dbg-btn dbg-btn--wide"
          onClick={handleAdvanceDay}
          disabled={!isSurvivorMode || isTerminal}
        >
          Advance Surveyeval Day
        </button>
        <button
          className="dbg-btn dbg-btn--wide"
          onClick={handleTerminalizeRun}
          disabled={!isSurvivorMode}
        >
          Terminalize Run
        </button>
      </div>

      {replacementTransition && (
        <div className="dbg-row">
          <button className="dbg-btn dbg-btn--wide" onClick={handleClearTransition}>
            Clear Replacement Transition
          </button>
        </div>
      )}
    </section>
  );
}
