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
import { addTvEvent, selfEvict, offerSecretMission, acceptSecretMission, declineSecretMission, updateMissionTaskProgress } from '../../store/gameSlice';
import {
  createInitialBigEyeState,
  generateBigBrotherReply,
  type BigEyeConversationState,
} from '../../services/bigBrother';
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal';
import DiaryWeekView from '../../components/DiaryWeekView';
import DiaryWeekEditor from '../../components/DiaryWeekEditor';
import { FEATURE_DIARY_WEEK, exportDiaryWeekJson } from '../../services/diaryWeek';
import type { DiaryWeek } from '../../types/diaryWeek';
import { useConfessionalTicTacToeTrigger } from './useConfessionalTicTacToeTrigger';
import './DiaryRoom.css';

type DiaryTab = 'confess' | 'log' | 'weekly';

/** Delivery status of a user-sent message. */
type MessageStatus = 'sending' | 'delivered' | 'seen';
type TicTacToeMark = 'X' | 'O';
type TicTacToeCell = TicTacToeMark | null;

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
 *   Daily    → Daily Diary Room Log (read-only view + admin editor)
 *              Only shown when FEATURE_DIARY_WEEK is enabled.
 *
 * To extend: add new tabs to TABS and a case in the tab body below.
 */
const TABS: { id: DiaryTab; label: string; icon: string }[] = [
  { id: 'confess', label: 'Confess',   icon: '🎙️' },
  { id: 'log',     label: 'Log',       icon: '📖' },
  ...(FEATURE_DIARY_WEEK ? [{ id: 'weekly' as DiaryTab, label: 'Daily', icon: '📅' }] : []),
];

// ─── Summary message pool (10 generic messages, no private content) ───────────
const SUMMARY_POOL = [
  '{name} whispered secrets in the Confessional. The feeds perked up.',
  '{name} had a heart-to-heart with The Big Eye. No cameras allowed.',
  'The Confessional door just closed behind {name}. What was said stays in there.',
  '{name} just left the Confessional looking... thoughtful.',
  'The Big Eye called {name} to the Confessional. The other housemates noticed.',
  '{name} spent some quality time in the Confessional. Drama incoming?',
  'Sources close to the Confessional report {name} was very talkative today.',
  '{name} and The Big Eye had words. The House will never know what.',
  'The Confessional light is off — {name} just wrapped up a private session.',
  '{name} visited the Confessional. Whatever was said, it stays private.',
];

const TIC_TAC_TOE_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function createEmptyTicTacToeBoard(): TicTacToeCell[] {
  return Array.from({ length: 9 }, () => null);
}

function getTicTacToeWinner(board: TicTacToeCell[]): TicTacToeMark | null {
  for (const [a, b, c] of TIC_TAC_TOE_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

function findTicTacToeLineMove(board: TicTacToeCell[], mark: TicTacToeMark): number | null {
  for (const [a, b, c] of TIC_TAC_TOE_LINES) {
    const line = [board[a], board[b], board[c]];
    const markCount = line.filter((cell) => cell === mark).length;
    const emptyCount = line.filter((cell) => cell === null).length;

    if (markCount === 2 && emptyCount === 1) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      return c;
    }
  }

  return null;
}

function pickBigEyeTicTacToeMove(board: TicTacToeCell[]): number | null {
  const winningMove = findTicTacToeLineMove(board, 'O');
  if (winningMove !== null) return winningMove;

  const blockingMove = findTicTacToeLineMove(board, 'X');
  if (blockingMove !== null) return blockingMove;

  const fallbackOrder = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  return fallbackOrder.find((index) => board[index] === null) ?? null;
}

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

function conversationStateKey(playerId: string): string {
  return `bb_dr_state_${playerId}`;
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

function loadConversationState(playerId: string): BigEyeConversationState {
  try {
    if (loadChat(playerId).length === 0) {
      return createInitialBigEyeState();
    }

    const raw = sessionStorage.getItem(conversationStateKey(playerId));
    return raw ? (JSON.parse(raw) as BigEyeConversationState) : createInitialBigEyeState();
  } catch {
    return createInitialBigEyeState();
  }
}

function saveConversationState(playerId: string, state: BigEyeConversationState): void {
  try {
    sessionStorage.setItem(conversationStateKey(playerId), JSON.stringify(state));
  } catch {
    // fail silently
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
    <div className="diary-room__chat" aria-live="polite" aria-label="Confessional chat">
      {msgs.length === 0 ? (
        <p className="diary-room__empty">No messages yet. Speak freely.</p>
      ) : (
        msgs.map((msg) => (
          <div
            key={msg.id}
            className={`diary-room__bubble diary-room__bubble--${msg.role}`}
          >
            <span className="diary-room__bubble-author">
              {msg.role === 'user' ? playerName : '📺 The Big Eye'}
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
  const playerName = userPlayer?.name ?? 'Housemate';
  const playerId = userPlayer?.id ?? 'user';
  const secretMission = useAppSelector((s) => s.game.secretMission);
  const currentWeekForMission = useAppSelector((s) => s.game.week);

  const [activeTab, setActiveTab] = useState<DiaryTab>('confess');
  const [entry, setEntry] = useState('');
  const [loading, setLoading] = useState(false);
  const [bbTyping, setBbTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat(playerId));
  const [showSelfEvictConfirm, setShowSelfEvictConfirm] = useState(false);
  const [conversationState, setConversationState] = useState<BigEyeConversationState>(
    () => loadConversationState(playerId),
  );
  const { active: ticTacToeActive, launchTicTacToe, dismissTicTacToe } = useConfessionalTicTacToeTrigger();
  const [ticTacToeBoard, setTicTacToeBoard] = useState<TicTacToeCell[]>(() => createEmptyTicTacToeBoard());
  const [ticTacToeNextTurn, setTicTacToeNextTurn] = useState<TicTacToeMark>('X');
  const [ticTacToeThinking, setTicTacToeThinking] = useState(false);

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

  const ticTacToeWinner = getTicTacToeWinner(ticTacToeBoard);
  const ticTacToeDraw = !ticTacToeWinner && ticTacToeBoard.every((cell) => cell !== null);

  useEffect(() => {
    if (!ticTacToeActive || ticTacToeNextTurn !== 'O' || ticTacToeWinner || ticTacToeDraw) {
      setTicTacToeThinking(false);
      return;
    }

    setTicTacToeThinking(true);

    const timeoutId = window.setTimeout(() => {
      setTicTacToeBoard((prev) => {
        const move = pickBigEyeTicTacToeMove(prev);
        if (move === null) return prev;

        const nextBoard = [...prev];
        nextBoard[move] = 'O';
        return nextBoard;
      });
      setTicTacToeNextTurn('X');
      setTicTacToeThinking(false);
    }, 420);

    return () => {
      window.clearTimeout(timeoutId);
      setTicTacToeThinking(false);
    };
  }, [ticTacToeActive, ticTacToeDraw, ticTacToeNextTurn, ticTacToeWinner]);

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

  // ── Secret mission: inject Big Eye offer when entering the Confessional ──
  // Fires once on mount when there is an untriggered offer (available) or a
  // re-offerable decline (declined + offerCount < 2).
  const secretMissionRef = useRef(secretMission);
  useEffect(() => { secretMissionRef.current = secretMission; }, [secretMission]);
  const currentWeekRef = useRef(currentWeekForMission);
  useEffect(() => { currentWeekRef.current = currentWeekForMission; }, [currentWeekForMission]);

  useEffect(() => {
    const sm = secretMissionRef.current;
    const week = currentWeekRef.current;
    const shouldOffer =
      sm &&
      (sm.status === 'available' ||
        (sm.status === 'declined' && sm.offerCount < 2));
    if (!shouldOffer) return;

    // Dispatch offer state change
    dispatchRef.current(offerSecretMission(week));

    // Inject Big Eye offer as a chat bubble (after a brief delay for tone)
    const timeoutId = window.setTimeout(() => {
      const offerMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'bb',
        text: `Welcome, ${playerNameRef.current}. This day seems to have been quite tough for you so far. But the Big Eye may have an offer that could lift your spirits. Would you like to hear it?`,
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        const updated = [...prev, offerMsg];
        saveChat(playerIdRef.current, updated);
        return updated;
      });
    }, 600);

    return () => { window.clearTimeout(timeoutId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // ── Secret mission: track confessional visit count on unmount ─────────────
  useEffect(() => {
    return () => {
      const sm = secretMissionRef.current;
      if (!sm || sm.status !== 'accepted') return;
      const visitTask = sm.tasks.find((t) => t.type === 'confessional_visits');
      if (!visitTask || visitTask.completed) return;
      dispatchRef.current(
        updateMissionTaskProgress({
          taskId: visitTask.id,
          current: visitTask.current + 1,
        }),
      );
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on unmount

  // ── Secret mission: passive survive_days task update ──────────────────────
  // Runs whenever week advances while the mission is accepted.
  useEffect(() => {
    const sm = secretMission;
    if (!sm || sm.status !== 'accepted') return;
    const surviveTask = sm.tasks.find((t) => t.type === 'survive_days');
    if (!surviveTask || surviveTask.completed) return;
    if (currentWeekForMission >= surviveTask.target) {
      dispatch(updateMissionTaskProgress({ taskId: surviveTask.id, current: currentWeekForMission }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekForMission]);

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

    try {
      const resp = await generateBigBrotherReply({
        diaryText: text,
        playerName,
        phase,
        seed,
        state: conversationState,
      });
      setConversationState(resp.nextState);
      saveConversationState(playerId, resp.nextState);

      // Simulate BB thinking before replying.
      const typingDelay = Math.max(300, Math.min(1200, resp.delayMs));
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

      if (resp.action === 'launch_tic_tac_toe') {
        setTicTacToeBoard(createEmptyTicTacToeBoard());
        setTicTacToeNextTurn('X');
        setTicTacToeThinking(false);
        launchTicTacToe();
      }
      if (resp.action === 'open_self_evict_modal') {
        setShowSelfEvictConfirm(true);
      }

      // Passive mission progress: count conversation turns (1 per exchange = 1 user + 1 BB reply)
      const smSnap = secretMissionRef.current;
      if (smSnap?.status === 'accepted') {
        const turnTask = smSnap.tasks.find((t) => t.type === 'conversation_turns');
        if (turnTask && !turnTask.completed) {
          dispatch(
            updateMissionTaskProgress({
              taskId: turnTask.id,
              current: turnTask.current + 1,
            }),
          );
        }
      }
    } catch (err) {
      console.error('The Big Eye AI error:', err);
      const detail = err instanceof Error ? err.message : 'Unknown error.';
      const bbErr: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'bb',
        text: `The Big Eye is unavailable: ${detail}`,
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
        description="Do you want to self-evict from The Big Eye house? This cannot be undone."
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
        <h1 className="diary-room__title">🚪 Confessional</h1>
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
              "You are now in the Confessional. No one can hear you. Speak freely."
            </p>
            {ticTacToeActive && (
              <div className="diary-room__mini-game-card" role="status" aria-live="polite">
                <div className="diary-room__mini-game-copy">
                  <div className="diary-room__mini-game-header">
                    <div>
                      <strong>The Big Eye opened a game.</strong>
                      <div className="diary-room__mini-game-subtitle">Tic Tac Toe is awake. Keep your nerve.</div>
                    </div>
                    <div className="diary-room__mini-game-status" aria-label="Tic tac toe status">
                      {ticTacToeWinner === 'X'
                        ? 'You win.'
                        : ticTacToeWinner === 'O'
                          ? 'The Big Eye wins.'
                          : ticTacToeDraw
                            ? "It's a draw."
                            : ticTacToeThinking
                              ? 'The Big Eye is thinking…'
                              : 'Your turn.'}
                    </div>
                  </div>
                  <div className="diary-room__tic-tac-toe-board" role="group" aria-label="Tic Tac Toe board">
                    {ticTacToeBoard.map((cell, index) => (
                      <button
                        key={index}
                        className={`diary-room__tic-tac-toe-cell${cell ? ' diary-room__tic-tac-toe-cell--filled' : ''}`}
                        type="button"
                        aria-label={`Tic tac toe square ${index + 1}${cell ? `, ${cell}` : ''}`}
                        disabled={
                          cell !== null ||
                          ticTacToeNextTurn !== 'X' ||
                          ticTacToeThinking ||
                          ticTacToeWinner !== null ||
                          ticTacToeDraw
                        }
                        onClick={() => {
                          const nextBoard = [...ticTacToeBoard];
                          nextBoard[index] = 'X';
                          setTicTacToeBoard(nextBoard);
                          setTicTacToeNextTurn('O');
                        }}
                      >
                        {cell ?? ''}
                      </button>
                    ))}
                  </div>
                  <div className="diary-room__mini-game-actions">
                    <button
                      className="diary-room__mini-game-btn"
                      type="button"
                      onClick={() => {
                        setTicTacToeBoard(createEmptyTicTacToeBoard());
                        setTicTacToeNextTurn('X');
                        setTicTacToeThinking(false);
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
                <button
                  className="diary-room__mini-game-btn"
                  type="button"
                  onClick={() => {
                    setTicTacToeBoard(createEmptyTicTacToeBoard());
                    setTicTacToeNextTurn('X');
                    setTicTacToeThinking(false);
                    dismissTicTacToe();
                  }}
                >
                  Close
                </button>
              </div>
            )}
            <ChatBubbles msgs={messages} playerName={playerName} endRef={confessEndRef} />
            {bbTyping && (
              <div className="diary-room__bb-typing" aria-live="polite" aria-atomic="true">
                <span className="diary-room__bb-typing-label">📺 The Big Eye</span>
                <span className="diary-room__typing-dot" />
                <span className="diary-room__typing-dot" />
                <span className="diary-room__typing-dot" />
              </div>
            )}

            {/* ── Secret mission offer buttons ───────────────────────────── */}
            {secretMission?.status === 'offered' && (
              <div className="diary-room__mission-offer" aria-label="Secret mission offer">
                <button
                  className="diary-room__mission-btn diary-room__mission-btn--accept"
                  type="button"
                  onClick={() => {
                    dispatch(acceptSecretMission());
                    const acceptMsg: ChatMessage = {
                      id: crypto.randomUUID(),
                      role: 'bb',
                      text: `Complete this private checklist, and the Big Eye will reward you. But choose carefully — not every gift comes without a price.`,
                      timestamp: Date.now(),
                    };
                    setMessages((prev) => {
                      const updated = [...prev, acceptMsg];
                      saveChat(playerId, updated);
                      return updated;
                    });
                  }}
                >
                  ✅ Accept the mission
                </button>
                <button
                  className="diary-room__mission-btn diary-room__mission-btn--decline"
                  type="button"
                  onClick={() => {
                    dispatch(declineSecretMission(currentWeekForMission));
                    const declineMsg: ChatMessage = {
                      id: crypto.randomUUID(),
                      role: 'bb',
                      text: `Very well. The Big Eye respects your caution. Return if you change your mind.`,
                      timestamp: Date.now(),
                    };
                    setMessages((prev) => {
                      const updated = [...prev, declineMsg];
                      saveChat(playerId, updated);
                      return updated;
                    });
                  }}
                >
                  ❌ Decline
                </button>
              </div>
            )}

            {/* ── Secret mission checklist (active) ─────────────────────── */}
            {secretMission && (secretMission.status === 'accepted' || secretMission.status === 'completed' || secretMission.status === 'rewardPending') && (
              <div className="diary-room__mission-checklist" aria-label="Secret mission checklist">
                <p className="diary-room__mission-title">
                  🕵️ Secret Mission
                  {secretMission.status === 'completed' || secretMission.status === 'rewardPending'
                    ? ' — Complete!'
                    : ''}
                </p>
                {secretMission.tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`diary-room__mission-task${task.completed ? ' diary-room__mission-task--done' : ''}`}
                  >
                    <span className="diary-room__mission-task-icon">
                      {task.completed ? '✅' : '⬜'}
                    </span>
                    <span className="diary-room__mission-task-desc">{task.description}</span>
                    {!task.completed && (
                      <span className="diary-room__mission-task-progress">
                        {task.current}/{task.target}
                      </span>
                    )}
                  </div>
                ))}
                {(secretMission.status === 'completed' || secretMission.status === 'rewardPending') && (
                  <p className="diary-room__mission-reward-pending">
                    🎁 Reward pending — the Big Eye will reveal your prize soon.
                  </p>
                )}
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
                    Season {seasonId} · Day {currentWeek}
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
