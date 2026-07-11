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

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties, type FormEvent } from 'react';
import { useBlocker, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  addTvEvent,
  selfEvict,
  offerSecretMission,
  acceptSecretMission,
  declineSecretMission,
  claimMissionReward,
  recordSecretMissionEasterEgg,
  submitTwinShockAnswer,
  selectAlivePlayers,
} from '../../store/gameSlice';
import { selectActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors';
import ConfessionalDecisionPanel from './ConfessionalDecisionPanel';
import { getConfessionalDecisionPresentation } from './confessionalDecisionPresentation';
import { getSecretMissionEasterEggByIntent } from '../../bb/secretMissionEasterEggs';
import {
  SECRET_MISSION_BOX_REWARDS,
  getSecretMissionBoxRewards,
  findSecretMissionTaskReference,
  getSecretMissionTaskHint,
  pickMissionImmunityDuration,
  type SecretMissionBoxRewardType,
} from '../../bb/secretMission';
import { classifyTwinShockAnswer, resolveTwinShockTurn } from '../../bb/twinShock';
import { applyInfluenceDelta } from '../../social/socialSlice';
import {
  createInitialBigEyeState,
  generateBigBrotherReply,
  type BigEyeConversationState,
} from '../../services/bigBrother';
import ConfirmExitModal from '../../components/ConfirmExitModal/ConfirmExitModal';
import { useConfessionalTicTacToeTrigger } from './useConfessionalTicTacToeTrigger';
import {
  buildEvictionVoteBreakdownPlayerNamesById,
  buildEvictionVoteBreakdownRows,
  isEvictionVoteBreakdownActive,
  loadEvictionVoteBreakdownUnlock,
  updateEvictionVoteBreakdownStatus,
  type EvictionVoteBreakdownUnlock,
} from '../../features/evictionVoteBreakdownStorage';
import './DiaryRoom.css';

/** Delivery status of a user-sent message. */
type MessageStatus = 'sending' | 'delivered' | 'seen';
type TicTacToeMark = 'X' | 'O';
type TicTacToeCell = TicTacToeMark | null;

export const DIARY_ROOM_ENTRY_OVERLAY_MS = 1320;
const CONFESSIONAL_LOCKED_DOOR_SRC = `${import.meta.env.BASE_URL}assets/diary-room/confessional-locked-door.png`;
const BIG_EYE_DECISION_CONFIRMATION = 'Your choice has been recorded. The ceremony will proceed.';

/** A single message in the private chat. */
interface ChatMessage {
  id: string;
  role: 'user' | 'bb';
  text: string;
  timestamp: number;
  /** Only present on user messages. */
  status?: MessageStatus;
  /** Present when a Big Eye message is the active confessional decision node. */
  decisionKey?: string;
}

// ─── Summary message pool (10 generic messages, no private content) ───────────
const SUMMARY_POOL = [
  '{name} whispered secrets in the Confessional. The feeds perked up.',
  '{name} had a heart-to-heart with The Big Eye. No cameras allowed.',
  'The Confessional door just closed behind {name}. What was said stays in there.',
  '{name} just left the Confessional looking... thoughtful.',
  'The Big Eye called {name} to the Confessional. The other players noticed.',
  '{name} spent some quality time in the Confessional. Drama incoming?',
  'Sources close to the Confessional report {name} was very talkative today.',
  '{name} and The Big Eye had words. The House will never know what.',
  'The Confessional light is off — {name} just wrapped up a private session.',
  '{name} visited the Confessional. Whatever was said, it stays private.',
];

const FIRST_VISIT_GREETING =
  'Hello, {name}! Welcome to the confessional. Here your thoughts may be echoed off the walls but your secrets will never leave the safe space. Share away.';

const RETURNING_VISIT_GREETINGS = [
  'Welcome back. I am all eyes.',
  'I have been expecting you.',
  'Ah, you return.',
  'Something tells me you are uneasy.',
];

// ─── Secret immunity reward messages ──────────────────────────────────────────

const REWARD_PENDING_MSG =
  `Well done. You fulfilled the mission — the Big Eye is impressed. ` +
  `Four reward boxes await. Choose one to reveal a prize such as Secret Immunity, ` +
  `1,000 Influence, Double Vote, or Vote Deduction before the window closes. 🎁`;

const VOTE_BREAKDOWN_DECLINED_TV_MESSAGE = "It's getting quiet in the house. Sandman on the way?";

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

/** Human-readable labels for each reward type used in the UI. */
const REWARD_LABELS: Record<string, string> = {
  plus1000Influence: '1,000 Influence',
  doubleVote: 'Double Vote',
  voteDeduction: 'Vote Deduction',
  immunity: 'Secret Immunity',
};

const REWARD_REVEAL_COPY: Record<SecretMissionBoxRewardType, (week: number, durationDays?: number) => string> = {
  plus1000Influence: () => 'The Big Eye grants you 1,000 Influence. Spend it wisely.',
  doubleVote: () => 'The Big Eye grants you a Double Vote. It will be offered automatically at your next eligible live vote.',
  voteDeduction: () => 'The Big Eye grants you Vote Deduction. If you are on the block at an eligible eviction, you may cut one vote from your total.',
  immunity: (week, durationDays = 1) =>
    `The Big Eye grants you temporary immunity for ${durationDays} day${durationDays === 1 ? '' : 's'}. It may be used during the Safety Ceremony while nominated and expires after Day ${week + durationDays - 1}.`,
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

function visitCountKey(playerId: string): string {
  return `bb_dr_visit_count_${playerId}`;
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

function saveConversationState(playerId: string, state: BigEyeConversationState): void {
  try {
    sessionStorage.setItem(conversationStateKey(playerId), JSON.stringify(state));
  } catch {
    // fail silently
  }
}

function clearConversationSession(playerId: string): void {
  try {
    sessionStorage.removeItem(chatKey(playerId));
    sessionStorage.removeItem(conversationStateKey(playerId));
  } catch {
    // fail silently
  }
}

function recordConfessionalVisit(playerId: string): number {
  try {
    const raw = sessionStorage.getItem(visitCountKey(playerId));
    const current = raw ? parseInt(raw, 10) : 0;
    const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
    sessionStorage.setItem(visitCountKey(playerId), String(next));
    return next;
  } catch {
    return 1;
  }
}

function buildEntryGreeting(playerName: string, seed: number, visitCount: number): ChatMessage {
  const text = visitCount <= 1
    ? FIRST_VISIT_GREETING.replace('{name}', playerName)
    // Second visit should use the first returning line, so offset the
    // visit count by two before applying the seeded rotation.
    : RETURNING_VISIT_GREETINGS[(seed + visitCount - 2) % RETURNING_VISIT_GREETINGS.length];

  return {
    id: crypto.randomUUID(),
    role: 'bb',
    text,
    timestamp: Date.now(),
  };
}

function getBigEyeTypingDelay(text: string): number {
  const normalizedLength = text.trim().length;
  return Math.max(420, Math.min(1180, 260 + normalizedLength * 12));
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
  activeDecisionKey?: string | null;
  activeDecisionPanel?: React.ReactNode;
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
function ChatBubbles({
  msgs,
  playerName,
  endRef,
  activeDecisionKey,
  activeDecisionPanel,
}: ChatBubblesProps) {
  return (
    <div className="diary-room__chat" aria-live="polite" aria-label="Confessional chat">
      {msgs.length === 0 ? (
        <p className="diary-room__empty">No messages yet. Speak freely.</p>
      ) : (
        msgs.map((msg) => {
          const isActiveDecision = Boolean(
            msg.role === 'bb' && msg.decisionKey && activeDecisionKey && msg.decisionKey === activeDecisionKey,
          );

          return (
            <div
              key={msg.id}
              className={`diary-room__bubble diary-room__bubble--${msg.role}${isActiveDecision ? ' diary-room__bubble--decision' : ''}`}
              data-testid={isActiveDecision ? 'confessional-decision-message' : undefined}
            >
              <span className="diary-room__bubble-author">
                {msg.role === 'user' ? playerName : '📺 The Big Eye'}
              </span>
              <span className="diary-room__bubble-text">{msg.text}</span>
              {isActiveDecision && activeDecisionPanel}
              <div className="diary-room__bubble-footer">
                <time className="diary-room__bubble-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </time>
                {msg.role === 'user' && <MessageStatusIcon status={msg.status} />}
              </div>
            </div>
          );
        })
      )}
      <div ref={endRef} />
    </div>
  );
}

export default function DiaryRoom() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const gameState = useAppSelector((s) => s.game);
  const phase = useAppSelector((s) => s.game.phase);
  const seed = useAppSelector((s) => s.game.seed);
  const userPlayer = useAppSelector((s) => s.game.players.find((p) => p.isUser));
  const playerName = userPlayer?.name ?? 'Housemate';
  const playerId = userPlayer?.id ?? 'user';
  const secretMission = useAppSelector((s) => s.game.secretMission);
  const currentWeekForMission = useAppSelector((s) => s.game.week);
  const players = useAppSelector((s) => s.game.players);
  const alivePlayers = useAppSelector(selectAlivePlayers);
  const confessionalLocked = userPlayer?.status === 'evicted' || userPlayer?.status === 'jury';

  // ── Active ceremony decision routed to the confessional ───────────────────
  // When non-null the player must complete the decision before leaving.
  const activeConfessionalDecision = useAppSelector(selectActiveConfessionalDecision);
  const confessionalDecisionPending = activeConfessionalDecision !== null;
  const navigationBlocker = useBlocker(confessionalDecisionPending);
  const navigationBlockerState = navigationBlocker.state;
  const resetNavigationBlocker = navigationBlocker.reset;

  const [entry, setEntry] = useState('');
  const [loading, setLoading] = useState(false);
  const [bbTyping, setBbTyping] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showEntryAnimation, setShowEntryAnimation] = useState(false);
  const [showSelfEvictConfirm, setShowSelfEvictConfirm] = useState(false);
  const [voteBreakdownUnlock, setVoteBreakdownUnlock] = useState<EvictionVoteBreakdownUnlock | null>(
    () => loadEvictionVoteBreakdownUnlock(),
  );
  const [conversationState, setConversationState] = useState<BigEyeConversationState>(createInitialBigEyeState);
  const { active: ticTacToeActive, launchTicTacToe, dismissTicTacToe } = useConfessionalTicTacToeTrigger();
  const [ticTacToeBoard, setTicTacToeBoard] = useState<TicTacToeCell[]>(() => createEmptyTicTacToeBoard());
  const [ticTacToeNextTurn, setTicTacToeNextTurn] = useState<TicTacToeMark>('X');
  const [ticTacToeThinking, setTicTacToeThinking] = useState(false);
  const activeVoteBreakdown = isEvictionVoteBreakdownActive(voteBreakdownUnlock, currentWeekForMission, phase)
    ? voteBreakdownUnlock
    : null;
  const voteBreakdownPlayerNamesById = useMemo(
    () => buildEvictionVoteBreakdownPlayerNamesById(players),
    [players],
  );
  const voteBreakdownRows = activeVoteBreakdown
    ? buildEvictionVoteBreakdownRows(activeVoteBreakdown.votes, voteBreakdownPlayerNamesById)
    : [];

  const playerNameById = useMemo(
    () => new Map(players.map((p) => [p.id, p.name])),
    [players],
  );

  const activeDecisionPresentation = useMemo(() => {
    if (!activeConfessionalDecision) return null;
    return getConfessionalDecisionPresentation(
      activeConfessionalDecision,
      gameState,
      alivePlayers,
    );
  }, [activeConfessionalDecision, alivePlayers, gameState]);

  const pushBigEyeMessage = useCallback((text: string) => {
    const nextMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'bb',
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      const updated = [...prev, nextMessage];
      saveChat(playerId, updated);
      return updated;
    });
  }, [playerId]);

  const appendBigEyeMessagesSequentially = useCallback(async (lines: string[]) => {
    for (const line of lines) {
      setBbTyping(true);
      await new Promise<void>((resolve) => setTimeout(resolve, getBigEyeTypingDelay(line)));
      setBbTyping(false);
      const nextMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'bb',
        text: line,
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        const updated = [...prev, nextMessage];
        saveChat(playerId, updated);
        return updated;
      });
      await new Promise<void>((resolve) => setTimeout(resolve, /[.!?]$/.test(line) ? 340 : 240));
    }
  }, [playerId]);

  // Track which mission already had its reward-pending message injected.
  const rewardMsgInjectedForMissionRef = useRef<string | null>(null);
  const rewardMissionKey = secretMission
    ? `${secretMission.missionNumber ?? 1}:${secretMission.triggeredDay}`
    : 'none';

  const dispatchRef = useRef(dispatch);
  useEffect(() => { dispatchRef.current = dispatch; }, [dispatch]);
  const confessionalDecisionPendingRef = useRef(confessionalDecisionPending);
  useEffect(() => { confessionalDecisionPendingRef.current = confessionalDecisionPending; }, [confessionalDecisionPending]);

  useEffect(() => {
    if (!confessionalDecisionPending && navigationBlockerState === 'blocked' && resetNavigationBlocker) {
      resetNavigationBlocker();
    }
  }, [confessionalDecisionPending, navigationBlockerState, resetNavigationBlocker]);

  useEffect(() => {
    if (confessionalDecisionPending && showSelfEvictConfirm) {
      setShowSelfEvictConfirm(false);
    }
  }, [confessionalDecisionPending, showSelfEvictConfirm]);

  // Stable refs for summary calculation (avoid stale closure on unmount)
  const playerNameRef = useRef(playerName);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  const playerIdRef = useRef(playerId);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  const seedRef = useRef(seed);
  useEffect(() => { seedRef.current = seed; }, [seed]);

  // Scroll ref for the chat panel
  const confessEndRef = useRef<HTMLDivElement>(null);

  // Reset and reinitialize the confessional session when lock state or player changes.
  useEffect(() => {
    clearConversationSession(playerId);

    if (confessionalLocked) {
      setMessages([]);
      setConversationState(createInitialBigEyeState());
      return;
    }

    const nextConversationState = createInitialBigEyeState();
    setConversationState(nextConversationState);
    saveConversationState(playerId, nextConversationState);
    if (confessionalDecisionPendingRef.current) {
      setMessages([]);
      saveChat(playerId, []);
      return;
    }

    const visitCount = recordConfessionalVisit(playerId);
    const greeting = buildEntryGreeting(playerNameRef.current, seedRef.current ?? 0, visitCount);
    setMessages([greeting]);
    saveChat(playerId, [greeting]);
  }, [confessionalLocked, playerId]);

  useEffect(() => {
    if (confessionalLocked || !activeDecisionPresentation) return;
    setMessages((prev) => {
      if (prev.some((msg) => msg.decisionKey === activeDecisionPresentation.key)) return prev;
      const decisionMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'bb',
        text: activeDecisionPresentation.prompt,
        timestamp: Date.now(),
        decisionKey: activeDecisionPresentation.key,
      };
      const updated = [...prev, decisionMsg];
      saveChat(playerId, updated);
      return updated;
    });
  }, [activeDecisionPresentation, confessionalLocked, playerId]);

  useEffect(() => {
    if (confessionalLocked) return;
    confessEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeDecisionPresentation, confessionalLocked, messages]);

  useEffect(() => {
    if (confessionalLocked) {
      setShowEntryAnimation(false);
      return;
    }
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    setShowEntryAnimation(true);
    const timeoutId = window.setTimeout(
      () => setShowEntryAnimation(false),
      DIARY_ROOM_ENTRY_OVERLAY_MS,
    );

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [confessionalLocked]);

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

  // On unmount: emit a single generic summary to tvFeed only when the player
  // actually sent at least one message. Read from sessionStorage so rapid
  // navigation after a send still sees the most recently persisted chat state.
  useEffect(() => {
    return () => {
      const pid = playerIdRef.current;
      const msgs = loadChat(pid);
      const hasUserMessage = msgs.some((msg) => msg.role === 'user');
      if (hasUserMessage && !hasSummaryEmitted(pid)) {
        markSummaryEmitted(pid);
        const text = pickSummary(playerNameRef.current, seedRef.current ?? 0);
        dispatchRef.current(addTvEvent({ text, type: 'game' }));
      }
      clearConversationSession(pid);
    };
  }, []);

  // ── Secret mission: inject Big Eye offer when entering the Confessional ──
  // Runs on entry and also when the lock state changes so any pending timeout
  // is cleaned up if the player becomes ineligible mid-visit.
  const secretMissionRef = useRef(secretMission);
  useEffect(() => { secretMissionRef.current = secretMission; }, [secretMission]);
  const currentWeekRef = useRef(currentWeekForMission);
  useEffect(() => { currentWeekRef.current = currentWeekForMission; }, [currentWeekForMission]);

  useEffect(() => {
    if (confessionalLocked) return;
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
        text: `Welcome, ${playerNameRef.current}. Each day offers a new challenge, sometimes more than we can take. But the Big Eye may have an offer that could lift your spirits. Would you like to hear it?`,
        timestamp: Date.now(),
      };
      setMessages((prev) => {
        const updated = [...prev, offerMsg];
        saveChat(playerIdRef.current, updated);
        return updated;
      });
    }, 600);

    return () => { window.clearTimeout(timeoutId); };
  }, [confessionalLocked]);

  const assignedRewardBoxes = useMemo(
    () => (secretMission ? getSecretMissionBoxRewards(secretMission) : [...SECRET_MISSION_BOX_REWARDS]),
    [secretMission],
  );

  // ── Secret mission: inject reward-pending message on mount (PR 2) ─────────
  // When the player returns with a completed mission, Big Eye acknowledges the
  // success and prompts box selection. Also re-runs on lock changes so any
  // pending reveal timeout is canceled if the player becomes ineligible.
  useEffect(() => {
    if (confessionalLocked) return;
    const sm = secretMissionRef.current;
    if (!sm || sm.status !== 'rewardPending') {
      rewardMsgInjectedForMissionRef.current = null;
      return;
    }
    if (rewardMsgInjectedForMissionRef.current === rewardMissionKey) return;
    rewardMsgInjectedForMissionRef.current = rewardMissionKey;

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
  }, [confessionalLocked, rewardMissionKey, secretMission?.status]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (confessionalLocked) return;
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

    const latentTwinShockGuess =
      activeConfessionalDecision?.type !== 'twin_shock' &&
      gameState.twinShock?.status === 'day4_asked_no_correct_guess' &&
      gameState.twinShock.promptStage == null &&
      classifyTwinShockAnswer(text) === 'correct_twin_guess';

    if (
      gameState.twinShock &&
      (
        (activeConfessionalDecision?.type === 'twin_shock' && gameState.twinShock.promptStage) ||
        latentTwinShockGuess
      )
    ) {
      const currentPromptStage = gameState.twinShock.promptStage;
      const twinResult = resolveTwinShockTurn(gameState.twinShock, text, {
        playerName,
        liaActive: alivePlayers.some((player) => player.id === 'lia'),
      });
      dispatch(submitTwinShockAnswer(text));
      setMessages((prev) => {
        const withSeen = prev.map((m) =>
          m.role === 'user' && m.status !== 'seen' ? { ...m, status: 'seen' as MessageStatus } : m,
        );
        saveChat(playerId, withSeen);
        return withSeen;
      });
      const nextPromptWillRender =
        twinResult.promptStage !== null &&
        twinResult.promptStage !== currentPromptStage;
      if (!nextPromptWillRender) {
        await appendBigEyeMessagesSequentially(twinResult.messages);
      }
      setLoading(false);
      return;
    }

    const isMissionHintRequest =
      secretMission?.status === 'accepted' &&
      /(?:how|hint|help|explain|more info|what (?:do|is)|gimme|give me|complete\s+(?:task|mission))/i.test(text);
    const missionTaskReference = isMissionHintRequest
      ? findSecretMissionTaskReference(text, secretMission.tasks)
      : null;
    if (missionTaskReference) {
      setMessages((prev) => {
        const withSeen = prev.map((message) =>
          message.role === 'user' && message.status !== 'seen'
            ? { ...message, status: 'seen' as MessageStatus }
            : message,
        );
        saveChat(playerId, withSeen);
        return withSeen;
      });
      await appendBigEyeMessagesSequentially([
        getSecretMissionTaskHint(
          missionTaskReference.task,
          missionTaskReference.taskNumber,
        ),
      ]);
      setLoading(false);
      return;
    }

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
      if (resp.action === 'open_self_evict_modal' && !confessionalDecisionPending) {
        setShowSelfEvictConfirm(true);
      }

      const discoveredEgg = getSecretMissionEasterEggByIntent(resp.intent);
      if (discoveredEgg) {
        dispatch(recordSecretMissionEasterEgg({
          eggId: discoveredEgg.id,
          day: currentWeekForMission,
        }));
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

  const handleDecisionCommitted = useCallback((summary: string) => {
    const userDecisionMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: summary,
      timestamp: Date.now(),
      status: 'seen',
    };
    const bigEyeConfirmationMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'bb',
      text: BIG_EYE_DECISION_CONFIRMATION,
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      const updated = [...prev, userDecisionMsg, bigEyeConfirmationMsg];
      saveChat(playerId, updated);
      return updated;
    });
  }, [playerId]);

  return (
    <div className="diary-room">
      {!confessionalLocked && showEntryAnimation && (
        <div
          className="diary-room__entry-overlay"
          data-testid="confessional-entry-overlay"
          aria-hidden="true"
          style={
            {
              '--diary-room-entry-overlay-ms': `${DIARY_ROOM_ENTRY_OVERLAY_MS}ms`,
            } as CSSProperties
          }
        >
          <div className="diary-room__entry-stage">
            <div className="diary-room__entry-light" />
            <div className="diary-room__entry-threshold" />
            <div className="diary-room__entry-doorway">
              <div className="diary-room__entry-header-ornament" />
              <div className="diary-room__entry-seam" />
              <div className="diary-room__entry-door diary-room__entry-door--left">
                <img
                  className="diary-room__entry-door-image diary-room__entry-door-image--left"
                  data-testid="confessional-entry-door-image"
                  src={CONFESSIONAL_LOCKED_DOOR_SRC}
                  alt=""
                />
              </div>
              <div className="diary-room__entry-door diary-room__entry-door--right">
                <img
                  className="diary-room__entry-door-image diary-room__entry-door-image--right"
                  data-testid="confessional-entry-door-image"
                  src={CONFESSIONAL_LOCKED_DOOR_SRC}
                  alt=""
                />
              </div>
            </div>
          </div>
          <div className="diary-room__entry-copy">
            <span className="diary-room__entry-eyebrow">Confessional</span>
            <strong>The Big Eye is ready for you.</strong>
          </div>
        </div>
      )}

      <div
        className={`diary-room__shell${showEntryAnimation ? ' diary-room__shell--masked' : ''}`}
        data-testid="diary-room-shell"
      >
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
          {confessionalDecisionPending ? (
            /* Decision pending — back navigation is locked until resolved. */
            <span
              className="diary-room__back diary-room__back--locked"
              aria-label="Decision required — complete your choice before leaving"
              title="You must complete your decision before leaving the Confessional."
              data-testid="diary-room-back-locked"
            >
              🔒 Locked
            </span>
          ) : (
            <button
              className="diary-room__back"
              onClick={() => navigate(-1)}
              type="button"
              aria-label="Go back"
            >
              ‹ Back
            </button>
          )}
          <h1 className="diary-room__title">🚪 Confessional</h1>
        </div>

        <div className="diary-room__body">
          {confessionalLocked ? (
            <section className="diary-room__locked" aria-label="Confessional locked">
              <div className="diary-room__locked-door" data-testid="confessional-locked-door">
                <img
                  className="diary-room__locked-door-image"
                  data-testid="confessional-locked-door-image"
                  src={CONFESSIONAL_LOCKED_DOOR_SRC}
                  alt=""
                />
              </div>
              <span className="diary-room__locked-eyebrow">Confessional</span>
              <h2 className="diary-room__locked-title">The door is locked.</h2>
              <p className="diary-room__locked-copy">
                Once you are out of the game, the Big Eye will not open the Confessional again.
              </p>
            </section>
          ) : (
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
            {activeVoteBreakdown?.status === 'available' && (
              <div className="diary-room__vote-reveal-card" aria-label="Vote reveal offer">
                <span className="diary-room__vote-reveal-eyebrow">📺 The Big Eye</span>
                <p className="diary-room__vote-reveal-copy">Are you ready to peek behind the curtain?</p>
                <div className="diary-room__vote-reveal-actions">
                  <button
                    className="diary-room__mission-btn diary-room__mission-btn--accept"
                    type="button"
                    onClick={() => {
                      setVoteBreakdownUnlock(updateEvictionVoteBreakdownStatus('revealed'));
                      pushBigEyeMessage('Then look closely. The curtain is lifting now.');
                    }}
                  >
                    Yes
                  </button>
                  <button
                    className="diary-room__mission-btn diary-room__mission-btn--decline"
                    type="button"
                    onClick={() => {
                      setVoteBreakdownUnlock(updateEvictionVoteBreakdownStatus('declined'));
                      dispatch(addTvEvent({
                        text: VOTE_BREAKDOWN_DECLINED_TV_MESSAGE,
                        type: 'game',
                      }));
                      pushBigEyeMessage('The house secret is safe with me. You can leave the Confessional.');
                    }}
                  >
                    No
                  </button>
                </div>
              </div>
            )}
            {activeVoteBreakdown?.status === 'revealed' && (
              <section className="diary-room__vote-chart" aria-label="Eviction vote breakdown">
                <div className="diary-room__vote-chart-header">
                  <span className="diary-room__vote-reveal-eyebrow">Vote Breakdown</span>
                  <strong>Who voted for whom</strong>
                </div>
                <div className="diary-room__vote-chart-table" role="table" aria-label="Eviction vote chart">
                  {voteBreakdownRows.map((row) => (
                    <div key={row.voterKey} className="diary-room__vote-chart-row" role="row">
                      <span className="diary-room__vote-chart-cell" role="cell">{row.voterName}</span>
                      <span className="diary-room__vote-chart-arrow" aria-hidden="true">→</span>
                      <span className="diary-room__vote-chart-cell diary-room__vote-chart-cell--target" role="cell">{row.targetName}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
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
                      text: `Very well. The Big Eye respects your caution. Return if you change your mind. Take too much and you may run out of luck.`,
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
                {secretMission.tasks.map((task) => {
                  const targetName = task.targetPlayerId
                    ? playerNameById.get(task.targetPlayerId)
                    : undefined;
                  const displayDesc = targetName
                    ? task.description.replace('your marked target', targetName)
                    : task.description;
                  return (
                  <div
                    key={task.id}
                    className={`diary-room__mission-task${task.completed ? ' diary-room__mission-task--done' : ''}`}
                  >
                    <span className="diary-room__mission-task-icon">
                      {task.completed ? '✅' : '⬜'}
                    </span>
                    <span className="diary-room__mission-task-desc">{displayDesc}</span>
                    {!task.completed && (
                      <span className="diary-room__mission-task-progress">
                        {task.current}/{task.target}
                      </span>
                    )}
                  </div>
                  );
                })}

                {/* ── Immunity reward claim (rewardPending) ───────────── */}
                {secretMission.status === 'rewardPending' && (
                  <div className="diary-room__mystery-boxes" aria-label="Secret mission reward boxes">
                    <p className="diary-room__mystery-boxes-prompt">
                      🎁 Choose one mystery box:
                    </p>
                    <div className="diary-room__mystery-boxes-grid">
                      {assignedRewardBoxes.map((_, index) => (
                        <button
                          key={`${rewardMissionKey}:${index}`}
                          className="diary-room__mystery-box-btn"
                          type="button"
                          aria-label={`Open Mystery Box ${index + 1}`}
                          onClick={() => {
                            const rewardType = assignedRewardBoxes[index];
                            if (!rewardType) return;
                            if (rewardType === 'immunity') {
                              const durationDays = pickMissionImmunityDuration(
                                secretMission.triggeredDay,
                                secretMission.templateId,
                              );
                              dispatch(claimMissionReward({ claimDay: currentWeekForMission, durationDays }));
                              const revealMsg: ChatMessage = {
                                id: crypto.randomUUID(),
                                role: 'bb',
                                text: REWARD_REVEAL_COPY[rewardType](currentWeekForMission, durationDays),
                                timestamp: Date.now(),
                              };
                              setMessages((prev) => {
                                const updated = [...prev, revealMsg];
                                saveChat(playerIdRef.current, updated);
                                return updated;
                              });
                              return;
                            }
                            if (rewardType === 'plus1000Influence') {
                              dispatch(applyInfluenceDelta({ playerId: playerIdRef.current, delta: 1000 }));
                            }
                            dispatch(claimMissionReward(rewardType));
                            const revealMsg: ChatMessage = {
                              id: crypto.randomUUID(),
                              role: 'bb',
                              text: REWARD_REVEAL_COPY[rewardType](currentWeekForMission),
                              timestamp: Date.now(),
                            };
                            setMessages((prev) => {
                              const updated = [...prev, revealMsg];
                              saveChat(playerIdRef.current, updated);
                              return updated;
                            });
                          }}
                        >
                          🎁 Mystery Box {index + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Claimed reward status (rewardClaimed) ────────────── */}
                {secretMission.status === 'rewardClaimed' && secretMission.reward && (
                  <div className="diary-room__reward-claimed" aria-label="Claimed reward">
                    {secretMission.reward.expired ? (
                      <p className="diary-room__reward-claimed-expired">
                        ⏳ Your secret reward expired before it could be used.
                      </p>
                    ) : secretMission.reward.consumed ? (
                      <p className="diary-room__reward-claimed-used">
                        ✔️ {REWARD_LABELS[secretMission.reward.type] ?? 'Secret reward'} used.
                      </p>
                    ) : (
                      <>
                        <p className="diary-room__reward-claimed-active">
                          🔮 Secret power stored:{' '}
                          <strong>{REWARD_LABELS[secretMission.reward.type] ?? secretMission.reward.type}</strong>
                          {secretMission.reward.type === 'immunity' && secretMission.reward.durationDays
                            ? ` — ${secretMission.reward.durationDays} day${secretMission.reward.durationDays === 1 ? '' : 's'}`
                            : ''}
                        </p>
                        {secretMission.reward.type === 'immunity' && (
                          <p className="diary-room__reward-active-hint">
                            Use it during the Safety Ceremony while nominated. Expires after Day {secretMission.reward.activeUntilDay ?? currentWeekForMission}.
                          </p>
                        )}
                        {secretMission.reward.type === 'doubleVote' && (
                          <p className="diary-room__reward-active-hint">
                            It will be offered automatically at your next eligible live vote.
                          </p>
                        )}
                        {secretMission.reward.type === 'voteDeduction' && (
                          <p className="diary-room__reward-active-hint">
                            If you are on the block at an eligible eviction, you may remove one vote from your total.
                          </p>
                        )}
                        {secretMission.reward.type === 'immunity' && activeConfessionalDecision?.type === 'mission_immunity_offer' && (
                          <p className="diary-room__reward-active-hint">
                            📺 The Big Eye is ready to ask whether you want to spend it right now.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            <ChatBubbles
              msgs={messages}
              playerName={playerName}
              endRef={confessEndRef}
              activeDecisionKey={activeDecisionPresentation?.key}
              activeDecisionPanel={
                activeConfessionalDecision && (
                  <ConfessionalDecisionPanel
                    decision={activeConfessionalDecision}
                    onDecisionCommitted={handleDecisionCommitted}
                  />
                )
              }
            />
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
                <div className="diary-room__footer-actions">
                  <button
                    className="diary-room__submit"
                    type="submit"
                    disabled={!entry.trim() || loading}
                    aria-label="Send message"
                  >
                    {loading ? '⏳ Waiting…' : '📣 Send'}
                  </button>
                </div>
              </div>
            </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
