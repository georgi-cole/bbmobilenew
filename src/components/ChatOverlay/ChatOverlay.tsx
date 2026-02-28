/**
 * ChatOverlay — full-page messenger-style cinematic chat overlay.
 *
 * Slides up to fill the screen, reveals chat lines sequentially with a typing
 * indicator, then slides back down when the user taps Continue (or Skip).
 *
 * Skip:     instantly reveals all lines and fires onComplete immediately.
 * Continue: appears after all lines are revealed; starts the exit animation
 *           then fires onComplete once the animation finishes.
 *
 * Usage:
 *   <ChatOverlay
 *     lines={[{ id: '1', role: 'host', text: 'Hello!' }]}
 *     onComplete={() => setDone(true)}
 *   />
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Player } from '../../types';
import { resolveAvatarCandidates, isEmoji } from '../../utils/avatar';
import './ChatOverlay.css';

export interface ChatLine {
  id: string;
  role: string;
  player?: Player;
  text: string;
}

export interface ChatOverlayProps {
  lines: ChatLine[];
  /** Auto-play lines on mount. Default: true */
  autoPlay?: boolean;
  /** Typing speed multiplier (higher = faster). Default: 1 */
  typingSpeed?: number;
  /** Show a Skip button to reveal all lines at once. Default: true */
  skippable?: boolean;
  header?: { title?: string; subtitle?: string };
  /** Custom renderer for player avatars */
  avatarRenderer?: (p: Player) => React.ReactNode;
  /** Show player avatars next to lines. Default: true */
  showAvatars?: boolean;
  /** Called each time a new line becomes visible */
  onLineReveal?: (line: ChatLine, idx: number) => void;
  /**
   * Called when the overlay has fully exited.
   * • Skip  → fires immediately (synchronously).
   * • Continue (after autoPlay) → fires after the exit animation (~340 ms).
   * • Empty lines → fires immediately.
   */
  onComplete?: () => void;
  /** Accessible label for the dialog */
  ariaLabel?: string;
}

/** Base delay between lines (ms). Divided by typingSpeed. */
const BASE_TYPING_MS = 800;
/** How long the typing indicator shows before the next line appears (ms). */
const TYPING_INDICATOR_MS = 600;
/** Duration of the slide-down exit animation (ms). Must match CSS. */
export const EXIT_ANIM_MS = 340;

function ChatAvatar({ player }: { player: Player }) {
  const avatar = player.avatar ?? '';
  const [candidates] = useState(() => resolveAvatarCandidates(player));
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [allFailed, setAllFailed] = useState(false);

  // Try image candidates first (includes PNG paths and Dicebear fallback).
  // Only fall back to emoji / initial once all candidates are exhausted.
  if (!allFailed) {
    const src = candidates[candidateIdx];
    if (src) {
      return (
        <img
          className="chat-overlay__avatar-img"
          src={src}
          alt={player.name}
          onError={() => {
            if (candidateIdx === candidates.length - 1) {
              setAllFailed(true);
            } else {
              setCandidateIdx((i) => i + 1);
            }
          }}
        />
      );
    }
  }

  if (isEmoji(avatar)) {
    return <span className="chat-overlay__avatar-emoji">{avatar}</span>;
  }
  return (
    <span className="chat-overlay__avatar-initial">
      {player.name ? player.name[0].toUpperCase() : '?'}
    </span>
  );
}

function defaultAvatarRenderer(p: Player): React.ReactNode {
  return <ChatAvatar player={p} />;
}

export default function ChatOverlay({
  lines,
  autoPlay = true,
  typingSpeed = 1,
  skippable = true,
  header,
  avatarRenderer,
  showAvatars = true,
  onLineReveal,
  onComplete,
  ariaLabel,
}: ChatOverlayProps) {
  const [revealedCount, setRevealedCount] = useState(0);
  const [showTyping, setShowTyping] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const onLineRevealRef = useRef(onLineReveal);
  const onCompleteRef = useRef(onComplete);
  const linesRef = useRef(lines);
  onLineRevealRef.current = onLineReveal;
  onCompleteRef.current = onComplete;
  linesRef.current = lines;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  /** Sets completed flag; onComplete is NOT called here — see handleSkip / handleDismiss. */
  const markComplete = useCallback(() => {
    setCompleted(true);
    setShowTyping(false);
  }, []);

  /**
   * Skip: instantly reveals all lines and fires onComplete NOW (synchronously),
   * while playing the exit animation in the background.
   */
  const handleSkip = useCallback(() => {
    clearTimers();
    setShowTyping(false);
    setRevealedCount(lines.length);
    setCompleted(true);
    setExiting(true);
    onCompleteRef.current?.();
  }, [clearTimers, lines.length]);

  /**
   * Continue: starts the slide-down exit animation then fires onComplete after
   * the animation has finished (~EXIT_ANIM_MS).
   */
  const handleDismiss = useCallback(() => {
    setExiting(true);
    addTimer(() => {
      onCompleteRef.current?.();
    }, EXIT_ANIM_MS);
  }, [addTimer]);

  // Auto-scroll the feed to the bottom whenever a new line appears, but only if
  // the user hasn't manually scrolled up (within 100 px of the bottom counts as "at bottom")
  useEffect(() => {
    const el = feedRef.current;
    if (el) {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (isNearBottom) el.scrollTop = el.scrollHeight;
    }
  }, [revealedCount, showTyping]);

  useEffect(() => {
    const lines = linesRef.current;
    if (lines.length === 0) {
      // Nothing to reveal: fire complete immediately (no animation needed)
      onCompleteRef.current?.();
      return;
    }
    if (!autoPlay) return;

    let currentIdx = 0;

    function revealNext() {
      const currentLines = linesRef.current;
      if (currentIdx >= currentLines.length) {
        setShowTyping(false);
        markComplete();
        return;
      }

      const delay = BASE_TYPING_MS / typingSpeed;

      // Show typing indicator before the line appears
      setShowTyping(true);
      addTimer(() => {
        setShowTyping(false);
        const idx = currentIdx;
        setRevealedCount(idx + 1);
        onLineRevealRef.current?.(linesRef.current[idx], idx);
        currentIdx++;
        // Schedule next line
        addTimer(revealNext, delay / 2);
      }, TYPING_INDICATOR_MS / typingSpeed);
    }

    // Small initial delay before first line
    addTimer(revealNext, 200);

    return clearTimers;
  }, [autoPlay, lines.length, typingSpeed, addTimer, clearTimers, markComplete]);

  // If lines is empty, render nothing (onComplete was already called in effect)
  if (lines.length === 0) return null;

  const revealedLines = lines.slice(0, revealedCount);
  const renderAvatar = avatarRenderer ?? defaultAvatarRenderer;

  return (
    <div
      className={`chat-overlay${exiting ? ' chat-overlay--exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? header?.title ?? 'Chat'}
    >
      <div className="chat-overlay__panel">
        {(header?.title || header?.subtitle) && (
          <div className="chat-overlay__header">
            {header.title && (
              <p className="chat-overlay__header-title">{header.title}</p>
            )}
            {header.subtitle && (
              <p className="chat-overlay__header-subtitle">{header.subtitle}</p>
            )}
          </div>
        )}

        <div
          ref={feedRef}
          className="chat-overlay__feed"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {revealedLines.map((line) => (
            <div
              key={line.id}
              className={`chat-overlay__line chat-overlay__line--${line.role}`}
            >
              {showAvatars && line.player && (
                <div className="chat-overlay__avatar">
                  {renderAvatar(line.player)}
                </div>
              )}
              <div className="chat-overlay__bubble">
                {line.player && (
                  <span className="chat-overlay__speaker">{line.player.name}</span>
                )}
                <span className="chat-overlay__text">{line.text}</span>
              </div>
            </div>
          ))}

          {showTyping && (
            <div className="chat-overlay__typing" aria-label="Typing…">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="chat-overlay__footer">
          {skippable && !completed && !exiting && (
            <button
              className="chat-overlay__skip"
              onClick={handleSkip}
              aria-label="Skip to end"
            >
              Skip
            </button>
          )}
          {completed && !exiting && (
            <button
              className="chat-overlay__done"
              onClick={handleDismiss}
            >
              Continue →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
