/**
 * DiaryWeekEditor — admin form to create or update a diary week.
 *
 * The same component handles both create (no existingWeek) and edit
 * (existingWeek provided).  Submits to POST or PATCH accordingly.
 *
 * Client-side validation: seasonId and weekNumber are required.
 * published defaults to false (draft behaviour) to avoid accidental publishing.
 *
 * Requires adminKey prop (value of the x-admin-key header).
 */

import { useState, type FormEvent, type ChangeEvent } from 'react';
import type { DiaryWeek, CreateDiaryWeekPayload, EvictionVote } from '../types/diaryWeek';
import { createDiaryWeek, updateDiaryWeek } from '../services/diaryWeek';

interface Props {
  seasonId: string;
  adminKey: string;
  /** Provide to edit an existing week; omit to create a new one. */
  existingWeek?: DiaryWeek;
  /** Called with the saved week after a successful submit. */
  onSaved: (week: DiaryWeek) => void;
}

function listToLines(arr: string[]): string {
  return arr.join('\n');
}

function linesToList(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function votesToText(votes: EvictionVote[]): string {
  return votes.map((v) => `${v.voter}:${v.votedFor}`).join('\n');
}

function textToVotes(text: string): EvictionVote[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [voter = '', votedFor = ''] = l.split(':').map((s) => s.trim());
      return { voter, votedFor };
    })
    .filter((v) => v.voter || v.votedFor);
}

export default function DiaryWeekEditor({ seasonId, adminKey, existingWeek, onSaved }: Props) {
  const isEdit = Boolean(existingWeek);

  const [weekNumber, setWeekNumber] = useState(
    existingWeek ? String(existingWeek.weekNumber) : '',
  );
  const [startAt, setStartAt] = useState(existingWeek?.startAt?.slice(0, 10) ?? '');
  const [endAt, setEndAt] = useState(existingWeek?.endAt?.slice(0, 10) ?? '');
  const [hohWinner, setHohWinner] = useState(existingWeek?.hohWinner ?? '');
  const [posWinner, setPosWinner] = useState(existingWeek?.posWinner ?? '');
  const [nominees, setNominees] = useState(listToLines(existingWeek?.nominees ?? []));
  const [replacementNominee, setReplacementNominee] = useState(
    existingWeek?.replacementNominee ?? '',
  );
  const [votesText, setVotesText] = useState(votesToText(existingWeek?.evictionVotes ?? []));
  const [socialEvents, setSocialEvents] = useState(
    listToLines(existingWeek?.socialEvents ?? []),
  );
  const [misc, setMisc] = useState(listToLines(existingWeek?.misc ?? []));
  const [notes, setNotes] = useState(existingWeek?.notes ?? '');
  const [published, setPublished] = useState(existingWeek?.published ?? false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  function validate(): string[] {
    const errs: string[] = [];
    if (!seasonId.trim()) errs.push('seasonId is required.');
    const wn = parseInt(weekNumber, 10);
    if (!weekNumber.trim() || isNaN(wn) || wn < 1) {
      errs.push('weekNumber must be a positive integer.');
    }
    return errs;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (errs.length) {
      setValidationErrors(errs);
      return;
    }
    setValidationErrors([]);
    setSaveError(null);
    setSaving(true);

    const payload: CreateDiaryWeekPayload = {
      seasonId,
      weekNumber: parseInt(weekNumber, 10),
      startAt: startAt || null,
      endAt: endAt || null,
      hohWinner: hohWinner.trim() || null,
      posWinner: posWinner.trim() || null,
      nominees: linesToList(nominees),
      replacementNominee: replacementNominee.trim() || null,
      evictionVotes: textToVotes(votesText),
      socialEvents: linesToList(socialEvents),
      misc: linesToList(misc),
      notes: notes.trim() || null,
      published,
    };

    try {
      let saved: DiaryWeek;
      if (isEdit && existingWeek) {
        saved = await updateDiaryWeek(seasonId, existingWeek.weekNumber, payload, adminKey);
      } else {
        saved = await createDiaryWeek(seasonId, payload, adminKey);
      }
      onSaved(saved);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function field(
    label: string,
    input: React.ReactNode,
    hint?: string,
  ) {
    return (
      <div className="dw-editor__field">
        <label className="dw-editor__label">{label}</label>
        {input}
        {hint && <span className="dw-editor__hint">{hint}</span>}
      </div>
    );
  }

  return (
    <form className="dw-editor" onSubmit={handleSubmit} noValidate>
      <h2 className="dw-editor__title">
        {isEdit ? `Edit Day ${existingWeek?.weekNumber}` : 'Create New Day'}
      </h2>

      {validationErrors.length > 0 && (
        <ul className="dw-editor__errors" role="alert">
          {validationErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {saveError && (
        <p className="dw-editor__save-error" role="alert">⚠️ {saveError}</p>
      )}

      {field(
        'Day Number *',
        <input
          className="dw-editor__input"
          type="number"
          min={1}
          value={weekNumber}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekNumber(e.target.value)}
          disabled={isEdit}
          required
        />,
        isEdit ? 'Day number cannot be changed.' : undefined,
      )}

      <div className="dw-editor__row">
        {field(
          'Start Date',
          <input
            className="dw-editor__input"
            type="date"
            value={startAt}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setStartAt(e.target.value)}
          />,
        )}
        {field(
          'End Date',
          <input
            className="dw-editor__input"
            type="date"
            value={endAt}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEndAt(e.target.value)}
          />,
        )}
      </div>

      {field(
        'LOH Winner',
        <input
          className="dw-editor__input"
          type="text"
          value={hohWinner}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setHohWinner(e.target.value)}
          placeholder="Housemate name"
        />,
      )}

      {field(
        'POS Winner',
        <input
          className="dw-editor__input"
          type="text"
          value={posWinner}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setPosWinner(e.target.value)}
          placeholder="Housemate name"
        />,
      )}

      {field(
        'Nominees',
        <textarea
          className="dw-editor__textarea"
          rows={3}
          value={nominees}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNominees(e.target.value)}
          placeholder="One name per line"
        />,
        'One name per line.',
      )}

      {field(
        'Backup Nominee',
        <input
          className="dw-editor__input"
          type="text"
          value={replacementNominee}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setReplacementNominee(e.target.value)}
          placeholder="Housemate name (if any)"
        />,
      )}

      {field(
        'Elimination Votes',
        <textarea
          className="dw-editor__textarea"
          rows={4}
          value={votesText}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setVotesText(e.target.value)}
          placeholder="voter:votedFor (one per line)"
        />,
        'Format: VoterName:EliminatedName — one vote per line.',
      )}

      {field(
        'Social Events',
        <textarea
          className="dw-editor__textarea"
          rows={3}
          value={socialEvents}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setSocialEvents(e.target.value)}
          placeholder="One event per line"
        />,
        'One event per line.',
      )}

      {field(
        'Misc Notes',
        <textarea
          className="dw-editor__textarea"
          rows={3}
          value={misc}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMisc(e.target.value)}
          placeholder="One note per line"
        />,
        'One item per line.',
      )}

      {field(
        'Notes',
        <textarea
          className="dw-editor__textarea"
          rows={3}
          value={notes}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
          placeholder="Free-form notes"
        />,
      )}

      <div className="dw-editor__field dw-editor__field--checkbox">
        <label className="dw-editor__checkbox-label">
          <input
            type="checkbox"
            checked={published}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setPublished(e.target.checked)}
          />
          {' '}Publish this week (uncheck to keep as draft)
        </label>
      </div>

      <button
        className="dw-editor__submit"
        type="submit"
        disabled={saving}
      >
        {saving ? '⏳ Saving…' : isEdit ? '💾 Save Changes' : '➕ Create Day'}
      </button>
    </form>
  );
}
