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
import { addTvEvent, selfEvict, offerSecretMission, acceptSecretMission, declineSecretMission, updateMissionTaskProgress, claimMissionReward } from '../../store/gameSlice';
import { applyInfluenceDelta } from '../../social/socialSlice';
import type { MissionRewardType } from '../../bb/secretMission';
import { MYSTERY_BOX_POOL } from '../../bb/secretMission';
import {
  createInitialBigEyeState,
  generateBigBrotherReply,
  type BigEyeConversationState,
} from '../../services/bigBrother';
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal';
import { useConfessionalTicTacToeTrigger } from './useConfessionalTicTacToeTrigger';
import './DiaryRoom.css';

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

// ─── Mystery box reward messages ──────────────────────────────────────────────

const REWARD_PENDING_MSG =
  `Well done. You fulfilled the mission — the Big Eye is impressed. ` +
  `Four mystery boxes await you. Only one is yours. Choose wisely… or rely on luck. 📦`;

const REWARD_MESSAGES: Record<string, string> = {
  plus1000Influence:
    `The Big Eye smiles. You have been granted 1 000 units of influence. ` +
    `Use this wisely — social capital is everything in this house. 🤝✨`,
  doubleVote:
    `A rare gift: the power of a Double Vote. When the time is right, ` +
    `you will cast two votes instead of one. Guard this secret carefully. 🗳️🗳️`,
  voteDeduction:
    `Cunning choice. One vote cast against you will vanish without a trace. ` +
    `The power is yours — stored, ready, waiting. 🪄`,
  emptyBox:
    `…The box is empty. Not every mystery holds treasure. ` +
    `But perhaps the real prize was the courage to open it. 😶‍🌫️ The Big Eye is amused.`,
};

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

/**
 * Shuffle the mystery box pool using a seeded Fisher-Yates algorithm so the
 * box order is different each game but reproducible within a session.
 *
 * Note: mutates and returns the input array — always pass a spread copy,
 * e.g. `shuffleMysteryPool([...MYSTERY_BOX_POOL], seed)`.
 */
function shuffleMysteryPool(pool: MissionRewardType[], seed: number): MissionRewardType[] {
  let s = ((seed >>> 0) || 1);
  // Simple seeded LCG
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** Human-readable labels for each reward type used in the UI. */
const REWARD_LABELS: Record<string, string> = {
  plus1000Influence: '+1 000 Influence (applied)',
  doubleVote: 'Double Vote',
  voteDeduction: 'Vote Deduction',
  emptyBox: 'Empty Box',
};

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

export default function DiaryRoom() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const phase = useAppSelector((s) => s.game.phase);
  const seed = useAppSelector((s) => s.game.seed);
  const userPlayer = useAppSelector((s) => s.game.players.find((p) => p.isUser));
  const playerName = userPlayer?.name ?? 'Housemate';
  const playerId = userPlayer?.id ?? 'user';
  const secretMission = useAppSelector((s) => s.game.secretMission);
  const currentWeekForMission = useAppSelector((s) => s.game.week);
  // PR 3 — read active power states so the Confessional can display status.
  const awaitingDoubleVoteOffer = useAppSelector((s) => s.game.awaitingDoubleVoteOffer);
  const humanDoubleVoteActive = useAppSelector((s) => s.game.humanDoubleVoteActive);
  const awaitingVoteDeductionPrompt = useAppSelector((s) => s.game.awaitingVoteDeductionPrompt);

  const [entry, setEntry] = useState('');
  const [loading, setLoading] = useState(false);
  const [bbTyping, setBbTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChat(playerId));
  const [showEntryAnimation, setShowEntryAnimation] = useState(false);
  const [showSelfEvictConfirm, setShowSelfEvictConfirm] = useState(false);
  const [conversationState, setConversationState] = useState<BigEyeConversationState>(
    () => loadConversationState(playerId),
  );
  const { active: ticTacToeActive, launchTicTacToe, dismissTicTacToe } = useConfessionalTicTacToeTrigger();
  const [ticTacToeBoard, setTicTacToeBoard] = useState<TicTacToeCell[]>(() => createEmptyTicTacToeBoard());
  const [ticTacToeNextTurn, setTicTacToeNextTurn] = useState<TicTacToeMark>('X');
  const [ticTacToeThinking, setTicTacToeThinking] = useState(false);

  // ── Mystery box state (PR 2) ──────────────────────────────────────────────
  // A shuffled copy of the pool is created once when entering rewardPending so
  // each visit produces the same ordering within a session but the assignments
  // are not obvious to the player.
  const [shuffledBoxes, setShuffledBoxes] = useState<MissionRewardType[]>(() =>
    shuffleMysteryPool([...MYSTERY_BOX_POOL], seed ?? 0),
  );
  // Track whether the reward reveal message has been injected this visit.
  const rewardMsgInjectedRef = useRef(false);

  const dispatchRef = useRef(dispatch);
  useEffect(() => { dispatchRef.current = dispatch; }, [dispatch]);

  // Stable refs for summary calculation (avoid stale closure on unmount)
  const playerNameRef = useRef(playerName);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  const playerIdRef = useRef(playerId);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  const seedRef = useRef(seed);
  useEffect(() => { seedRef.current = seed; }, [seed]);

  // Scroll ref for the chat panel
  const confessEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    confessEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    setShowEntryAnimation(true);
    const timeoutId = window.setTimeout(() => setShowEntryAnimation(false), 1320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

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
  }, []); // intentionally runs once on mount

  // ── Secret mission: inject reward-pending message on mount (PR 2) ─────────
  // When the player returns to the Confessional with a completed mission,
  // Big Eye acknowledges the success and prompts box selection.
  useEffect(() => {
    const sm = secretMissionRef.current;
    if (!sm || sm.status !== 'rewardPending') return;
    if (rewardMsgInjectedRef.current) return;
    rewardMsgInjectedRef.current = true;

    // Re-shuffle boxes so layout is stable within this visit
    setShuffledBoxes(shuffleMysteryPool([...MYSTERY_BOX_POOL], seedRef.current ?? 0));

    const timeoutId = window.setTimeout(() => {
      const revealMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'bb',
        text: REWARD_PENDING_MSG,
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        const updated = [...prev, revealMsg];
        saveChat(playerIdRef.current, updated);
        return updated;
      });
    }, 600);

    return () => { window.clearTimeout(timeoutId); };
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
      {showEntryAnimation && (
        <div
          className="diary-room__entry-overlay"
          data-testid="confessional-entry-overlay"
          aria-hidden="true"
        >
          <div className="diary-room__entry-light" />
          <div className="diary-room__entry-door diary-room__entry-door--left" />
          <div className="diary-room__entry-door diary-room__entry-door--right" />
          <div className="diary-room__entry-copy">
            <span className="diary-room__entry-eyebrow">Confessional</span>
            <strong>The Big Eye is ready for you.</strong>
          </div>
        </div>
      )}

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

      <div className="diary-room__body">
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
            {secretMission && (secretMission.status === 'accepted' || secretMission.status === 'rewardPending' || secretMission.status === 'rewardClaimed') && (
              <div className="diary-room__mission-checklist" aria-label="Secret mission checklist">
                <p className="diary-room__mission-title">
                  🕵️ Secret Mission
                  {secretMission.status === 'rewardPending' || secretMission.status === 'rewardClaimed'
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

                {/* ── Mystery box selection (rewardPending) ────────────── */}
                {secretMission.status === 'rewardPending' && (
                  <div className="diary-room__mystery-boxes" aria-label="Mystery box selection">
                    <p className="diary-room__mystery-boxes-prompt">
                      🎁 Choose your mystery box:
                    </p>
                    <div className="diary-room__mystery-boxes-grid">
                      {shuffledBoxes.map((rewardType, idx) => (
                        <button
                          key={idx}
                          className="diary-room__mystery-box-btn"
                          type="button"
                          aria-label={`Mystery Box ${idx + 1}`}
                          onClick={() => {
                            dispatch(claimMissionReward(rewardType));
                            // Apply +1000 influence instantly
                            if (rewardType === 'plus1000Influence' && userPlayer) {
                              dispatch(applyInfluenceDelta({ playerId: userPlayer.id, delta: 1000 }));
                            }
                            // Inject Big Eye reveal message
                            const revealMsg: ChatMessage = {
                              id: crypto.randomUUID(),
                              role: 'bb',
                              text: REWARD_MESSAGES[rewardType] ?? REWARD_MESSAGES.emptyBox,
                              timestamp: Date.now(),
                            };
                            setMessages((prev) => {
                              const updated = [...prev, revealMsg];
                              saveChat(playerIdRef.current, updated);
                              return updated;
                            });
                          }}
                        >
                          📦 Box {idx + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Claimed reward status (rewardClaimed) ────────────── */}
                {secretMission.status === 'rewardClaimed' && secretMission.reward && (
                  <div className="diary-room__reward-claimed" aria-label="Claimed reward">
                    {secretMission.reward.type === 'emptyBox' ? (
                      <p className="diary-room__reward-claimed-empty">
                        📭 Empty box — no power granted.
                      </p>
                    ) : secretMission.reward.expired ? (
                      <p className="diary-room__reward-claimed-expired">
                        ⏳ Your power has expired — Final 4 has been reached.
                      </p>
                    ) : secretMission.reward.consumed ? (
                      <p className="diary-room__reward-claimed-used">
                        ✔️ Power used.
                      </p>
                    ) : (
                      <>
                        <p className="diary-room__reward-claimed-active">
                          🔮 Secret power stored:{' '}
                          <strong>{REWARD_LABELS[secretMission.reward.type] ?? secretMission.reward.type}</strong>
                        </p>
                        {/* PR 3 — contextual hints when a power is currently actionable */}
                        {secretMission.reward.type === 'doubleVote' && awaitingDoubleVoteOffer && (
                          <p className="diary-room__reward-active-hint">
                            📺 The Big Eye is watching. Your Double Vote is ready — return to the game to decide.
                          </p>
                        )}
                        {secretMission.reward.type === 'doubleVote' && humanDoubleVoteActive && (
                          <p className="diary-room__reward-active-hint">
                            🗳️🗳️ Double Vote activated! Return to the game to cast your two votes.
                          </p>
                        )}
                        {secretMission.reward.type === 'voteDeduction' && awaitingVoteDeductionPrompt && (
                          <p className="diary-room__reward-active-hint">
                            📺 The Big Eye has a message for you. Return to the game — your Vote Deduction is waiting.
                          </p>
                        )}
                      </>
                    )}
                  </div>
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
      </div>
    </div>
  );
}
