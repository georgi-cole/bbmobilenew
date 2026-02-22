/**
 * DiaryWeekView — read-only display of a single diary week record.
 *
 * Shows: header (week number, date range, published badge), HOH / POV blocks,
 * nominees list, replacement nominee marker, eviction votes table with tally,
 * social events timeline, misc notes, and audit metadata.
 *
 * Includes loading and error states.
 */

import { useEffect, useReducer } from 'react';
import type { DiaryWeek } from '../types/diaryWeek';
import { getDiaryWeek } from '../services/diaryWeek';

interface Props {
  seasonId: string;
  weekNumber: number;
}

// ─── State machine ────────────────────────────────────────────────────────────

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; week: DiaryWeek };

type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_OK'; week: DiaryWeek }
  | { type: 'FETCH_ERR'; message: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START': return { status: 'loading' };
    case 'FETCH_OK':    return { status: 'ok', week: action.week };
    case 'FETCH_ERR':   return { status: 'error', message: action.message };
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Tally eviction votes: returns Map<candidateName, voteCount> sorted desc. */
function tallyVotes(votes: DiaryWeek['evictionVotes']): [string, number][] {
  const tally = new Map<string, number>();
  for (const { votedFor } of votes) {
    tally.set(votedFor, (tally.get(votedFor) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]);
}

export default function DiaryWeekView({ seasonId, weekNumber }: Props) {
  const [state, dispatch] = useReducer(reducer, { status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'FETCH_START' });
    getDiaryWeek(seasonId, weekNumber)
      .then((week) => { if (!cancelled) dispatch({ type: 'FETCH_OK', week }); })
      .catch((err: unknown) => {
        if (!cancelled)
          dispatch({ type: 'FETCH_ERR', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [seasonId, weekNumber]);

  if (state.status === 'loading') {
    return <p className="dw-view__loading">⏳ Loading week {weekNumber}…</p>;
  }

  if (state.status === 'error') {
    return <p className="dw-view__error" role="alert">⚠️ {state.message}</p>;
  }

  const { week } = state;

  const tally = tallyVotes(week.evictionVotes);

  return (
    <article className="dw-view" aria-label={`Diary Week ${week.weekNumber}`}>
      {/* ── Header ── */}
      <header className="dw-view__header">
        <h2 className="dw-view__title">Week {week.weekNumber}</h2>
        <p className="dw-view__dates">
          {formatDate(week.startAt)} – {formatDate(week.endAt)}
        </p>
        <span
          className={`dw-view__badge ${week.published ? 'dw-view__badge--published' : 'dw-view__badge--draft'}`}
        >
          {week.published ? '✅ Published' : '🔒 Draft'}
        </span>
      </header>

      {/* ── HOH / POV ── */}
      <section className="dw-view__section">
        <h3 className="dw-view__section-title">🏠 Competitions</h3>
        <div className="dw-view__comps">
          <div className="dw-view__comp-block">
            <span className="dw-view__comp-label">HOH</span>
            <span className="dw-view__comp-value">{week.hohWinner ?? '—'}</span>
          </div>
          <div className="dw-view__comp-block">
            <span className="dw-view__comp-label">POV</span>
            <span className="dw-view__comp-value">{week.povWinner ?? '—'}</span>
          </div>
        </div>
      </section>

      {/* ── Nominees ── */}
      <section className="dw-view__section">
        <h3 className="dw-view__section-title">🎯 Nominees</h3>
        {week.nominees.length === 0 ? (
          <p className="dw-view__empty">No nominees recorded.</p>
        ) : (
          <ul className="dw-view__list">
            {week.nominees.map((n) => (
              <li key={n} className="dw-view__list-item">
                {n}
                {n === week.replacementNominee && (
                  <span className="dw-view__replacement-badge" title="Replacement nominee">
                    {' '}🔄 replacement
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {week.replacementNominee && !week.nominees.includes(week.replacementNominee) && (
          <p className="dw-view__replacement-note">
            🔄 Replacement nominee: <strong>{week.replacementNominee}</strong>
          </p>
        )}
      </section>

      {/* ── Eviction Votes ── */}
      <section className="dw-view__section">
        <h3 className="dw-view__section-title">🗳️ Eviction Votes</h3>
        {week.evictionVotes.length === 0 ? (
          <p className="dw-view__empty">No votes recorded.</p>
        ) : (
          <>
            <table className="dw-view__votes-table">
              <thead>
                <tr>
                  <th>Voter</th>
                  <th>Voted to Evict</th>
                </tr>
              </thead>
              <tbody>
                {week.evictionVotes.map((v, i) => (
                  <tr key={i}>
                    <td>{v.voter}</td>
                    <td>{v.votedFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="dw-view__tally">
              <h4 className="dw-view__tally-title">Tally</h4>
              {tally.map(([name, count]) => (
                <div key={name} className="dw-view__tally-row">
                  <span className="dw-view__tally-name">{name}</span>
                  <span className="dw-view__tally-count">{count} vote{count !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Social Events ── */}
      {week.socialEvents.length > 0 && (
        <section className="dw-view__section">
          <h3 className="dw-view__section-title">🎉 Social Events</h3>
          <ol className="dw-view__timeline">
            {week.socialEvents.map((ev, i) => (
              <li key={i} className="dw-view__timeline-item">{ev}</li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Misc Notes ── */}
      {(week.misc.length > 0 || week.notes) && (
        <section className="dw-view__section">
          <h3 className="dw-view__section-title">📝 Notes</h3>
          {week.notes && <p className="dw-view__notes">{week.notes}</p>}
          {week.misc.length > 0 && (
            <ul className="dw-view__list">
              {week.misc.map((m, i) => (
                <li key={i} className="dw-view__list-item">{m}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── Audit ── */}
      <footer className="dw-view__audit">
        Created {formatDate(week.createdAt)} · Updated {formatDate(week.updatedAt)}
      </footer>
    </article>
  );
}
