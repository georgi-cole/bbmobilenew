/**
 * ChatOverlay — reusable cinematic chat overlay.
 *
 * Reveals chat lines sequentially with a typing indicator between each line.
 * Supports skip (reveals all lines immediately and fires onComplete).
 * Accessible: role="dialog", aria-live region for line announcements.
 *
 * Usage:
 *   <ChatOverlay
 *     lines={[{ id: '1', role: 'host', text: 'Hello!' }]}
 *     onComplete={() => setDone(true)}
 *   />
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Player } from '../../types';
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
  /** Called when all lines have been revealed */
  onComplete?: () => void;
  /** Accessible label for the dialog */
  ariaLabel?: string;
}

/** Base delay between lines (ms). Divided by typingSpeed. */
const BASE_TYPING_MS = 800;
/** How long the typing indicator shows before the next line appears (ms). */
const TYPING_INDICATOR_MS = 600;

function defaultAvatarRenderer(p: Player): React.ReactNode {
  const avatar = p.avatar ?? '';
  if (typeof avatar === 'string' && avatar.endsWith('.png')) {
    return <img className="chat-overlay__avatar-img" src={avatar} alt={p.name} />;
  }
  // If it looks like an emoji (single grapheme cluster), render it directly
  if (avatar && [...avatar].length <= 2) {
    return <span className="chat-overlay__avatar-emoji">{avatar}</span>;
  }
  // Fallback: first initial
  return (
    <span className="chat-overlay__avatar-initial">
      {p.name ? p.name[0].toUpperCase() : '?'}
    </span>
  );
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
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onLineRevealRef = useRef(onLineReveal);
  const onCompleteRef = useRef(onComplete);
  onLineRevealRef.current = onLineReveal;
  onCompleteRef.current = onComplete;

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  const markComplete = useCallback(() => {
    setCompleted(true);
    setShowTyping(false);
    onCompleteRef.current?.();
  }, []);

  // Skip: reveal all lines immediately and complete
  const handleSkip = useCallback(() => {
    clearTimers();
    setShowTyping(false);
    setRevealedCount(lines.length);
    // Call onLineReveal for any not-yet-revealed lines
    // (We don't loop here to keep it simple — callers that care can compare final count)
    markComplete();
  }, [clearTimers, lines.length, markComplete]);

  useEffect(() => {
    if (!autoPlay || lines.length === 0) {
      // Nothing to reveal; fire complete immediately
      if (lines.length === 0) {
        markComplete();
      }
      return;
    }

    let currentIdx = 0;

    function revealNext() {
      if (currentIdx >= lines.length) {
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
        onLineRevealRef.current?.(lines[idx], idx);
        currentIdx++;
        // Schedule next line
        addTimer(revealNext, delay / 2);
      }, TYPING_INDICATOR_MS / typingSpeed);
    }

    // Small initial delay before first line
    addTimer(revealNext, 200);

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, lines.length, typingSpeed]);

  // If lines is empty, render nothing (onComplete was already called in effect)
  if (lines.length === 0 && completed) return null;

  const revealedLines = lines.slice(0, revealedCount);
  const renderAvatar = avatarRenderer ?? defaultAvatarRenderer;

  return (
    <div
      className="chat-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? header?.title ?? 'Chat'}
    >
      <div className="chat-overlay__backdrop" />
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
              <span />
              <span />
              <span />
            </div>
          )}
        </div>

        {skippable && !completed && (
          <button
            className="chat-overlay__skip"
            onClick={handleSkip}
            aria-label="Skip to end"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
