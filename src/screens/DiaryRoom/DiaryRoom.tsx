import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { addTvEvent } from '../../store/gameSlice';
import { generateBigBrotherReply } from '../../services/bigBrother';
import DiaryWeekView from '../../components/DiaryWeekView';
import DiaryWeekEditor from '../../components/DiaryWeekEditor';
import { FEATURE_DIARY_WEEK, exportDiaryWeekJson } from '../../services/diaryWeek';
import { isVisibleInDr } from '../../services/activityService';
import type { DiaryWeek } from '../../types/diaryWeek';
import './DiaryRoom.css';

type DiaryTab = 'confess' | 'log' | 'weekly';

/**
 * DiaryRoom — private player confessional / game log screen.
 *
 * Tabs:
 *   Confess  → text input that fires an ADD_TV_EVENT of type 'diary'
 *   Log      → filtered view of diary events from the TV feed
 *   Weekly   → Weekly Diary Room Log (read-only view + admin editor)
 *              Only shown when FEATURE_DIARY_WEEK is enabled.
 *
 * To extend: add new tabs to TABS and a case in the tab body below.
 */
const TABS: { id: DiaryTab; label: string; icon: string }[] = [
  { id: 'confess', label: 'Confess',   icon: '🎙️' },
  { id: 'log',     label: 'Log',       icon: '📖' },
  ...(FEATURE_DIARY_WEEK ? [{ id: 'weekly' as DiaryTab, label: 'Weekly', icon: '📅' }] : []),
];

// ─── Weekly tab helpers ───────────────────────────────────────────────────────

/** Read admin key from sessionStorage (set by admin on first use). */
function getAdminKey(): string {
  return sessionStorage.getItem('bb_admin_key') ?? '';
}

/** Persist admin key to sessionStorage. */
function setAdminKey(key: string): void {
  sessionStorage.setItem('bb_admin_key', key);
}

/** Derive a simple isAdmin flag: any non-empty stored key is optimistically
 *  treated as admin; the server will return 403 if it is wrong. */
function useIsAdmin(): boolean {
  return Boolean(getAdminKey());
}

export default function DiaryRoom() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const tvFeed = useAppSelector((s) => s.game.tvFeed);
  const phase = useAppSelector((s) => s.game.phase);
  const seed = useAppSelector((s) => s.game.seed);
  const season = useAppSelector((s) => s.game.season);
  const playerName = useAppSelector(
    (s) => s.game.players.find((p) => p.isUser)?.name,
  );
  const [activeTab, setActiveTab] = useState<DiaryTab>('confess');
  const [entry, setEntry] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Weekly tab state ──────────────────────────────────────────────────────
  const isAdmin = useIsAdmin();
  const seasonId = String(season);
  const currentWeek = useAppSelector((s) => s.game.week);
  const [weeklyMode, setWeeklyMode] = useState<'view' | 'edit'>('view');
  const [savedWeek, setSavedWeek] = useState<DiaryWeek | null>(null);
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [adminKeySet, setAdminKeySet] = useState(Boolean(getAdminKey()));
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const diaryLog = tvFeed.filter(isVisibleInDr);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = entry.trim();
    if (!text) return;

    dispatch(addTvEvent({ text: `📖 Diary: "${text}"`, type: 'diary' }));
    setEntry('');
    setLoading(true);

    try {
      const resp = await generateBigBrotherReply({
        diaryText: text,
        playerName,
        phase,
        seed,
      });
      dispatch(addTvEvent({ text: `📺 Big Brother: ${resp.text}`, type: 'game' }));
    } catch (err) {
      console.error('Big Brother AI error:', err);
      const detail = err instanceof Error ? err.message : 'Unknown error.';
      dispatch(
        addTvEvent({
          text: `📺 Big Brother is unavailable: ${detail}`,
          type: 'game',
        }),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="diary-room">
      {/* Header */}
      <div className="diary-room__header">
        <button
          className="diary-room__back"
          onClick={() => navigate(-1)}
          type="button"
          aria-label="Go back"
        >
          ‹ Back
        </button>
        <h1 className="diary-room__title">🚪 Diary Room</h1>
      </div>

      {/* Tabs */}
      <div className="diary-room__tabs" role="tablist">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            className={`diary-room__tab${activeTab === id ? ' diary-room__tab--active' : ''}`}
            onClick={() => setActiveTab(id)}
            type="button"
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="diary-room__body">
        {activeTab === 'confess' && (
          <form className="diary-room__confess" onSubmit={handleSubmit}>
            <p className="diary-room__prompt">
              "You are now in the Diary Room. No one can hear you. Speak freely."
            </p>
            <textarea
              className="diary-room__textarea"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder="What are you thinking?"
              rows={4}
              maxLength={280}
              aria-label="Diary entry"
            />
            <div className="diary-room__footer">
              <span className="diary-room__charcount">{entry.length}/280</span>
              <button
                className="diary-room__submit"
                type="submit"
                disabled={!entry.trim() || loading}
              >
                {loading ? '⏳ Waiting…' : '📣 Submit Entry'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'log' && (
          <ul className="diary-room__log" aria-label="Diary entries">
            {diaryLog.length === 0 ? (
              <li className="diary-room__empty">No diary entries yet.</li>
            ) : (
              diaryLog.map((ev) => (
                <li key={ev.id} className="diary-room__log-item">
                  <span className="diary-room__log-text">{ev.text}</span>
                  <time className="diary-room__log-time">
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </time>
                </li>
              ))
            )}
          </ul>
        )}

        {FEATURE_DIARY_WEEK && activeTab === 'weekly' && (
          <div className="diary-room__weekly">
            {/* Admin key prompt (shown once; stored in sessionStorage) */}
            {!adminKeySet && (
              <div className="diary-room__admin-key-form">
                <p className="diary-room__admin-key-hint">
                  Enter admin key to enable editing (leave blank for read-only view):
                </p>
                <div className="diary-room__admin-key-row">
                  <input
                    className="diary-room__admin-key-input"
                    type="password"
                    value={adminKeyInput}
                    onChange={(e) => setAdminKeyInput(e.target.value)}
                    placeholder="Admin key (optional)"
                    aria-label="Admin key"
                  />
                  <button
                    className="diary-room__admin-key-btn"
                    type="button"
                    onClick={() => {
                      setAdminKey(adminKeyInput.trim());
                      setAdminKeySet(true);
                    }}
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {adminKeySet && (
              <>
                {/* Week controls */}
                <div className="diary-room__weekly-controls">
                  <span className="diary-room__weekly-label">
                    Season {seasonId} · Week {currentWeek}
                  </span>
                  <div className="diary-room__weekly-actions">
                    {isAdmin && (
                      <button
                        className="diary-room__weekly-btn"
                        type="button"
                        onClick={() =>
                          setWeeklyMode((m) => (m === 'view' ? 'edit' : 'view'))
                        }
                      >
                        {weeklyMode === 'view' ? '✏️ Edit' : '👁️ View'}
                      </button>
                    )}
                    {savedWeek && (
                      <>
                        <button
                          className="diary-room__weekly-btn"
                          type="button"
                          disabled={exporting}
                          onClick={async () => {
                            setExportError(null);
                            setExporting(true);
                            try {
                              await exportDiaryWeekJson(
                                savedWeek.id,
                                savedWeek.weekNumber,
                                getAdminKey() || undefined,
                              );
                            } catch (err: unknown) {
                              setExportError(err instanceof Error ? err.message : String(err));
                            } finally {
                              setExporting(false);
                            }
                          }}
                        >
                          {exporting ? '⏳' : '⬇️ Export JSON'}
                        </button>
                        {exportError && (
                          <span className="diary-room__export-error">{exportError}</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {weeklyMode === 'view' || !isAdmin ? (
                  <DiaryWeekView seasonId={seasonId} weekNumber={currentWeek} />
                ) : (
                  <DiaryWeekEditor
                    seasonId={seasonId}
                    adminKey={getAdminKey()}
                    existingWeek={savedWeek ?? undefined}
                    onSaved={(week) => {
                      setSavedWeek(week);
                      setWeeklyMode('view');
                    }}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
