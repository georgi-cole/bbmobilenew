import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { addTvEvent } from '../../store/gameSlice';
import { generateBigBrotherReply } from '../../services/bigBrother';
import './DiaryRoom.css';

type DiaryTab = 'confess' | 'log';

/**
 * DiaryRoom — private player confessional / game log screen.
 *
 * Tabs:
 *   Confess  → text input that fires an ADD_TV_EVENT of type 'diary'
 *   Log      → filtered view of diary events from the TV feed
 *
 * To extend: add new tabs to TABS and a case in the tab body below.
 */
const TABS: { id: DiaryTab; label: string; icon: string }[] = [
  { id: 'confess', label: 'Confess',   icon: '🎙️' },
  { id: 'log',     label: 'Log',       icon: '📖' },
];

export default function DiaryRoom() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const tvFeed = useAppSelector((s) => s.game.tvFeed);
  const phase = useAppSelector((s) => s.game.phase);
  const seed = useAppSelector((s) => s.game.seed);
  const playerName = useAppSelector(
    (s) => s.game.players.find((p) => p.isUser)?.name,
  );
  const [activeTab, setActiveTab] = useState<DiaryTab>('confess');
  const [entry, setEntry] = useState('');
  const [loading, setLoading] = useState(false);

  const diaryLog = tvFeed.filter((e) => e.type === 'diary');

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
      dispatch(
        addTvEvent({
          text: '📺 Big Brother: Your confession has been noted. The house is watching.',
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
      </div>
    </div>
  );
}
