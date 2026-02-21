/**
 * FinaleControls.debug.tsx – Debug Panel section for finale controls.
 *
 * Included inside DebugPanel when debug=1 is in the URL.
 */
import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { forcePhase } from '../../store/gameSlice';
import {
  forceJurorVote,
  rerollJurySeed,
  finalizeFinale,
  dismissFinale,
  selectFinale,
} from '../../store/finaleSlice';

export default function FinaleDebugControls() {
  const dispatch = useAppDispatch();
  const game = useAppSelector((s) => s.game);
  const finale = useAppSelector(selectFinale);

  const [forceJurorId, setForceJurorId] = useState('');
  const [forceFinalistId, setForceFinalistId] = useState('');

  const jurors = finale.revealOrder.map(
    (id) => game.players.find((p) => p.id === id),
  ).filter(Boolean);
  const finalists = finale.finalistIds.map(
    (id) => game.players.find((p) => p.id === id),
  ).filter(Boolean);
  const humanIds = game.players.filter((p) => p.isUser).map((p) => p.id);

  return (
    <section className="dbg-section">
      <h3 className="dbg-section__title">Finale / Jury</h3>

      <dl className="dbg-grid">
        <dt>Active</dt>     <dd>{finale.isActive ? 'yes' : 'no'}</dd>
        <dt>Started</dt>    <dd>{finale.hasStarted ? 'yes' : 'no'}</dd>
        <dt>Revealed</dt>   <dd>{finale.revealedCount} / {finale.revealOrder.length}</dd>
        <dt>Winner</dt>     <dd>{finale.winnerId ? (game.players.find(p => p.id === finale.winnerId)?.name ?? finale.winnerId) : '—'}</dd>
        <dt>Complete</dt>   <dd>{finale.isComplete ? 'yes' : 'no'}</dd>
      </dl>

      {/* Start finale (force jump) */}
      <div className="dbg-row">
        <button
          className="dbg-btn dbg-btn--wide"
          onClick={() => dispatch(forcePhase('week_end'))}
          title="Force game to week_end so clicking Advance triggers jury phase"
        >
          → Force week_end
        </button>
        <button
          className="dbg-btn dbg-btn--wide"
          onClick={() => dispatch(forcePhase('jury'))}
          title="Jump directly to jury phase (overlay initialises on next render)"
        >
          → Force jury
        </button>
      </div>

      {/* Force finalize */}
      {finale.isActive && !finale.isComplete && (
        <div className="dbg-row">
          <button
            className="dbg-btn dbg-btn--wide"
            onClick={() =>
              dispatch(finalizeFinale({ seed: game.seed, americasVoteEnabled: game.cfg?.americasVoteEnabled }))
            }
          >
            Fast-fwd Finale
          </button>
        </div>
      )}

      {/* Dismiss overlay */}
      {finale.isActive && (
        <div className="dbg-row">
          <button
            className="dbg-btn dbg-btn--wide dbg-btn--danger"
            onClick={() => dispatch(dismissFinale())}
          >
            Dismiss Overlay
          </button>
        </div>
      )}

      {/* Re-roll jury seed */}
      {finale.isActive && !finale.isComplete && (
        <div className="dbg-row">
          <button
            className="dbg-btn dbg-btn--wide"
            onClick={() =>
              dispatch(
                rerollJurySeed({
                  seed:
                    (Math.floor(Math.random() * 0x100000000) ^ (Date.now() & 0xffffffff)) >>> 0,
                  humanPlayerIds: humanIds,
                }),
              )
            }
          >
            Re-roll Jury Seed 🎲
          </button>
        </div>
      )}

      {/* Force a juror's vote */}
      {finale.isActive && finalists.length === 2 && jurors.length > 0 && (
        <div className="dbg-row dbg-row--col">
          <label className="dbg-label">Force Juror Vote</label>
          <div className="dbg-row">
            <select
              className="dbg-select"
              value={forceJurorId}
              onChange={(e) => setForceJurorId(e.target.value)}
            >
              <option value="">— juror —</option>
              {jurors.map((j) => j && (
                <option key={j.id} value={j.id}>{j.name}</option>
              ))}
            </select>
            <select
              className="dbg-select"
              value={forceFinalistId}
              onChange={(e) => setForceFinalistId(e.target.value)}
            >
              <option value="">— vote for —</option>
              {finalists.map((f) => f && (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button
              className="dbg-btn"
              disabled={!forceJurorId || !forceFinalistId}
              onClick={() => {
                dispatch(forceJurorVote({ jurorId: forceJurorId, finalistId: forceFinalistId }));
                setForceJurorId('');
                setForceFinalistId('');
              }}
            >
              Set
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
