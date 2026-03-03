/**
 * DiaryRoom — private player confessional / game log screen.
 *
 * Privacy guarantee: messages exchanged in the Confess tab are stored only in
 * sessionStorage (key: `bb_dr_chat_<playerId>`) and are never dispatched to the
 * global tvFeed.  A single generic summary event is emitted to the tvFeed once
 * when the component unmounts after at least one message was sent — the summary
 * does NOT contain any private content.  The summary flag is persisted in
 * sessionStorage (key: `bb_dr_summary_emitted_<playerId>`) so it survives
 * tab navigations within the same session.
 */

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { addTvEvent, selfEvict } from '../../store/gameSlice';
import { generateBigBrotherReply } from '../../services/bigBrother';
import { detectIntent } from '../../bb/engine';
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal';
import DiaryWeekView from '../../components/DiaryWeekView';
import DiaryWeekEditor from '../../components/DiaryWeekEditor';
import { FEATURE_DIARY_WEEK, exportDiaryWeekJson } from '../../services/diaryWeek';
import type { DiaryWeek } from '../../types/diaryWeek';
import './DiaryRoom.css';

type DiaryTab = 'confess' | 'log' | 'weekly';

/** Delivery status of a user-sent message. */
type MessageStatus = 'sending' | 'delivered' | 'seen';

/** A single message in the private chat. */
interface ChatMessage {
  id: string;
  role: 'user' | 'bb';
  text: string;
  timestamp: number;
  /** Only present on user messages. */
  status?: MessageStatus;
}

/**
 * DiaryRoom — private player confessional / game log screen.
 *
 * Tabs:
 *   Confess  → private chat (user ↔ Big Brother); stored in sessionStorage only
 *   Log      → read-only transcript of the private chat
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

// ─── Summary message pool (10 generic messages, no private content) ───────────
const SUMMARY_POOL = [
  '{name} whispered secrets in the Diary Room. The feeds perked up.',
  '{name} had a heart-to-heart with Big Brother. No cameras allowed.',
  'The Diary Room door just closed behind {name}. What was said stays in there.',
  '{name} just left the Diary Room looking... thoughtful.',
  'Big Brother called {name} to the Diary Room. The other houseguests noticed.',
  '{name} spent some quality time in the Diary Room. Drama incoming?',
  'Sources close to the Diary Room report {name} was very talkative today.',
  '{name} and Big Brother had words. The House will never know what.',
  'The Diary Room light is off — {name} just wrapped up a private session.',
  '{name} visited the Diary Room. Whatever was said, it stays private.',
];

/** Select a summary message deterministically from the pool. */
function pickSummary(name: string, seed: number): string {
  const idx = seed % SUMMARY_POOL.length;
  return SUMMARY_POOL[idx].replace('{name}', name);
}

// ─── sessionStorage helpers ───────────────────────────────────────────────────

function chatKey(playerId: string): string {
  return `bb_dr_chat_${playerId}`;
}

function summaryKey(playerId: string): string {
  return `bb_dr_summary_emitted_${playerId}`;
}

function loadChat(playerId: string): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(chatKey(playerId));
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function saveChat(playerId: string, messages: ChatMessage[]): void {
  try {
    sessionStorage.setItem(chatKey(playerId), JSON.stringify(messages));
  } catch {
    // sessionStorage may be unavailable in some contexts — fail silently
  }
}

function hasSummaryEmitted(playerId: string): boolean {
  try {
    return sessionStorage.getItem(summaryKey(playerId)) === '1';
  } catch {
    // sessionStorage may be unavailable; treat as "not emitted"
    return false;
  }
}

function markSummaryEmitted(playerId: string): void {
  try {
    sessionStorage.setItem(summaryKey(playerId), '1');
  } catch {
    // fail silently
  }
}

// ─── Chat bubbles component ───────────────────────────────────────────────────

interface ChatBubblesProps {
  msgs: ChatMessage[];
  playerName: string;
  endRef: React.RefObject<HTMLDivElement | null>;
}

/** Renders the status indicator for a user message. */
function MessageStatusIcon({ status }: { status?: MessageStatus }) {
  if (!status) return null;
  if (status === 'sending') {
    return (
      <span className="diary-room__status diary-room__status--sending" aria-label="Sending">
        <span className="diary-room__status-dot" />
      </span>
    );
  }
  return (
    <span
      className={`diary-room__status diary-room__status--${status}`}
      aria-label={status === 'seen' ? 'Seen' : 'Delivered'}
    />
  );
}

/** Renders private chat messages as styled bubbles. */
function ChatBubbles({ msgs, playerName, endRef }: ChatBubblesProps) {
  return (
    <div className="diary-room__chat" aria-live="polite" aria-label="Diary Room chat">
      {msgs.length === 0 ? (
        <p className="diary-room__empty">No messages yet. Speak freely.</p>
      ) : (
        msgs.map((msg) => (
          <div
            key={msg.id}
            className={`diary-room__bubble diary-room__bubble--${msg.role}`}
          >
            <span className="diary-room__bubble-author">
              {msg.role === 'user' ? playerName : '📺 Big Brother'}
            </span>
            <span className="diary-room__bubble-text">{msg.text}</span>
            <div className="diary-room__bubble-footer">
              <time className="diary-room__bubble-time">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </time>
              {msg.role === 'user' && <MessageStatusIcon status={msg.status} />}
            </div>
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  );
}

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
  const phase = useAppSelector((s) => s.game.phase);
  const seed = useAppSelector((s) => s.game.seed);
  const season = useAppSelector((s) => s.game.season);
  const userPlayer = useAppSelector((s) => s.game.players.find((p) => p.isUser));
  const playerName = userPlayer?.name ?? 'Houseguest';
  const playerId = userPlayer?.id ?? 'user';

  const [activeTab, setActiveTab] = useState<DiaryTab>('confess');
  const [entry, setEntry] = useState('');
  const [loading, setLoading] = useState(false);
  const [bbTyping, setBbTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat(playerId));
  const [awaitingQuitConfirmation, setAwaitingQuitConfirmation] = useState(false);
  const [showSelfEvictConfirm, setShowSelfEvictConfirm] = useState(false);

  /** Returns true if the given text is a simple affirmative reply. */
  function isAffirmative(text: string): boolean {
    return /^\s*(yes|yeah|yep|yup|sure|certainly|absolutely|ok|okay|yea|affirmative)\s*[.!]?\s*$/i.test(text);
  }

  const dispatchRef = useRef(dispatch);
  useEffect(() => { dispatchRef.current = dispatch; }, [dispatch]);

  // Stable refs for summary calculation (avoid stale closure on unmount)
  const playerNameRef = useRef(playerName);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  const playerIdRef = useRef(playerId);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  const seedRef = useRef(seed);
  useEffect(() => { seedRef.current = seed; }, [seed]);

  // Scroll refs for the chat panels
  const confessEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change (only scroll the visible tab)
  useEffect(() => {
    if (activeTab === 'confess') {
      confessEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (activeTab === 'log') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  // On unmount: emit a single generic summary to tvFeed if chat is non-empty.
  // Use loadChat() from sessionStorage rather than messagesRef so the check
  // is always accurate even if the user navigates before the ref-sync effect runs.
  useEffect(() => {
    return () => {
      const pid = playerIdRef.current;
      const msgs = loadChat(pid);
      if (msgs.length > 0 && !hasSummaryEmitted(pid)) {
        markSummaryEmitted(pid);
        const text = pickSummary(playerNameRef.current, seedRef.current ?? 0);
        dispatchRef.current(addTvEvent({ text, type: 'game' }));
      }
    };
  }, []);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = entry.trim();
    if (!text) return;

    const msgId = crypto.randomUUID();
    const userMsg: ChatMessage = {
      id: msgId,
      role: 'user',
      text,
      timestamp: Date.now(),
      status: 'sending',
    };

    /**
     * Return a new messages array with the status of the message matching `id` updated.
     * Caller is responsible for persisting the updated array to state and sessionStorage.
     */
    function updateStatus(id: string, status: MessageStatus, prev: ChatMessage[]): ChatMessage[] {
      return prev.map((m) => (m.id === id ? { ...m, status } : m));
    }

    const next = [...messages, userMsg];
    setMessages(next);
    saveChat(playerId, next);
    setEntry('');
    setLoading(true);
    setBbTyping(false);

    // Transition: sending → delivered after a short artificial delay
    await new Promise<void>((resolve) => setTimeout(resolve, 350));
    setMessages((prev) => {
      const updated = updateStatus(msgId, 'delivered', prev);
      saveChat(playerId, updated);
      return updated;
    });

    // ── Quit-intent interception ────────────────────────────────────────────
    if (awaitingQuitConfirmation) {
      if (isAffirmative(text)) {
        const ackMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'bb',
          text: "Understood. Take a moment if you need it.",
          timestamp: Date.now(),
        };
        setMessages((prev) => {
          const withSeen = prev.map((m) =>
            m.role === 'user' && m.status !== 'seen' ? { ...m, status: 'seen' as MessageStatus } : m,
          );
          const withAck = [...withSeen, ackMsg];
          saveChat(playerId, withAck);
          return withAck;
        });
        setAwaitingQuitConfirmation(false);
        setShowSelfEvictConfirm(true);
        setLoading(false);
        return;
      } else {
        setAwaitingQuitConfirmation(false);
        // Fall through to normal LLM flow
      }
    } else {
      // Check for quit intent in first submission
      let intent: string | null = null;
      try {
        intent = detectIntent(text);
      } catch (err) {
        console.error('detectIntent error:', err);
        // detectIntent is synchronous and shouldn't throw; fall through to LLM
      }
      if (intent === 'quit') {
        const bbAsk: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'bb',
          text: "Do you really want to leave the Big Brother house?",
          timestamp: Date.now(),
        };
        setMessages((prev) => {
          const withSeen = prev.map((m) =>
            m.role === 'user' && m.status !== 'seen' ? { ...m, status: 'seen' as MessageStatus } : m,
          );
          const withAsk = [...withSeen, bbAsk];
          saveChat(playerId, withAsk);
          return withAsk;
        });
        setAwaitingQuitConfirmation(true);
        setLoading(false);
        return;
      }
    }
    // ── End quit-intent interception ────────────────────────────────────────

    try {
      const resp = await generateBigBrotherReply({
        diaryText: text,
        playerName,
        phase,
        seed,
      });

      // Simulate BB typing: delay proportional to reply length (client-side only).
      // Does NOT affect tvFeed — the summary emission on unmount is unchanged.
      const typingDelay = Math.max(500, Math.min(2200, 400 + resp.text.length * 6));
      setBbTyping(true);
      await new Promise<void>((resolve) => setTimeout(resolve, typingDelay));
      setBbTyping(false);

      const bbMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'bb',
        text: resp.text,
        timestamp: Date.now(),
      };

      // Mark all previous user messages as 'seen' when BB replies
      setMessages((prev) => {
        const withSeen = prev.map((m) =>
          m.role === 'user' && m.status !== 'seen' ? { ...m, status: 'seen' as MessageStatus } : m,
        );
        const withReply = [...withSeen, bbMsg];
        saveChat(playerId, withReply);
        return withReply;
      });
    } catch (err) {
      console.error('Big Brother AI error:', err);
      const detail = err instanceof Error ? err.message : 'Unknown error.';
      const bbErr: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'bb',
        text: `Big Brother is unavailable: ${detail}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        const withErr = [...prev, bbErr];
        saveChat(playerId, withErr);
        return withErr;
      });
    } finally {
      setBbTyping(false);
      setLoading(false);
    }
  }

  return (
    <div className="diary-room">
      {/* Self-evict confirmation modal */}
      <ConfirmExitModal
        open={showSelfEvictConfirm}
        title="Self-Evict?"
        description="Do you want to self-evict from the Big Brother house? This cannot be undone."
        confirmLabel="Yes, Leave"
        cancelLabel="No, Stay"
        onConfirm={() => {
          setShowSelfEvictConfirm(false);
          dispatch(selfEvict(playerId));
          navigate('/self-evicted');
        }}
        onCancel={() => setShowSelfEvictConfirm(false)}
      />

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
          <div className="diary-room__confess">
            <p className="diary-room__prompt">
              "You are now in the Diary Room. No one can hear you. Speak freely."
            </p>
            <ChatBubbles msgs={messages} playerName={playerName} endRef={confessEndRef} />
            {bbTyping && (
              <div className="diary-room__bb-typing" aria-live="polite" aria-atomic="true">
                <span className="diary-room__bb-typing-label">📺 Big Brother</span>
                <span className="diary-room__typing-dot" />
                <span className="diary-room__typing-dot" />
                <span className="diary-room__typing-dot" />
              </div>
            )}
            <form className="diary-room__confess-form" onSubmit={handleSubmit}>
              <textarea
                className="diary-room__textarea"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="What are you thinking?"
                rows={3}
                maxLength={280}
                aria-label="Diary entry"
              />
              <div className="diary-room__footer">
                <span className="diary-room__charcount">{entry.length}/280</span>
                <button
                  className="diary-room__submit"
                  type="submit"
                  disabled={!entry.trim() || loading}
                  aria-label="Send message"
                >
                  {loading ? '⏳ Waiting…' : '📣 Send'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'log' && (
          <div className="diary-room__log-tab">
            <ChatBubbles msgs={messages} playerName={playerName} endRef={logEndRef} />
          </div>
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
