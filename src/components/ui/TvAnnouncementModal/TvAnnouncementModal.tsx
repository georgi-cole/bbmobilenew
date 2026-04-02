import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './TvAnnouncementModal.css';

// ─── Phase copy ───────────────────────────────────────────────────────────────

interface PhaseCopy {
  icon: string;
  label: string;
  category: string;
  body: string;
}

const PHASE_COPY: Record<string, PhaseCopy> = {
  week_start: {
    icon: '📅',
    label: 'NEW DAY',
    category: 'Game Event',
    body: 'A new day begins in The Big Eye house. Housemates reset their social games and strategise before the Leader of the House competition. Alliances shift, targets are reconsidered, and the house dynamics evolve.',
  },
  nomination_ceremony: {
    icon: '🎯',
    label: 'NOMINATIONS',
    category: 'Ceremony',
    body: 'The Leader of the House gathers all housemates and places two nominees on the block for potential elimination. Nominees have the chance to save themselves by winning the Power of Safety. Every speech and every alliance is tested in this moment.',
  },
  veto_competition: {
    icon: '🏆',
    label: 'SAFETY COMP',
    category: 'Competition',
    body: 'Six players compete for the Power of Safety — the most powerful item in the game. The winner decides whether to keep the nominations the same or pull a nominee off the block, forcing the LOH to name a backup nominee.',
  },
  veto_ceremony: {
    icon: '🏅',
    label: 'SAFETY CEREMONY',
    category: 'Ceremony',
    body: 'The Power of Safety holder announces their decision: use the Safety to save a nominee, or keep the nominations unchanged. When used, the LOH must immediately name a backup nominee — and they cannot choose the outgoing LOH.',
  },
  live_eviction: {
    icon: '📺',
    label: 'LIVE ELIMINATION',
    category: 'Live Event',
    body: 'The house votes live to eliminate one of the current nominees. All eligible voters cast their ballots privately. The nominee with the most votes is eliminated and leaves the house immediately to join the Tribunal (or go home, pre-Tribunal). In a tie, the Leader of the House casts the deciding vote.',
  },
  final4: {
    icon: '4️⃣',
    label: 'FINAL 4',
    category: 'Endgame',
    body: 'Only four players remain. The stakes are at their highest — every competition, every vote, every conversation could determine who makes it to the Final 3. At this stage there is no longer a traditional safety ceremony; the POS holder is the sole vote to eliminate.',
  },
  final3: {
    icon: '3️⃣',
    label: 'FINAL 3',
    category: 'Endgame',
    body: 'The Final 3 have earned their place. They now compete in the legendary three-part Leader of the House competition. Part 1 is an endurance battle. Part 2 tests skill and memory. The winners of Parts 1 and 2 face off in Part 3, and the winner becomes the Final Leader of the House.',
  },
  final_hoh: {
    icon: '👑',
    label: 'FINAL LOH',
    category: 'Endgame',
    body: 'The Final Leader of the House holds the most consequential power in the game. They alone decide who sits beside them in the Final 2 — and who is sent to the Tribunal just one step from the prize. This single choice often defines legacies.',
  },
  jury: {
    icon: '⚖️',
    label: 'TRIBUNAL VOTES',
    category: 'Tribunal Phase',
    body: 'The Tribunal — made up of the last eliminated housemates — casts their votes to award the grand prize. Each judge votes for the finalist they believe most deserves to win based on game play, social game, and competition performance. The finalist with the most Tribunal votes is crowned the winner of The Big Eye.',
  },
  battle_back: {
    icon: '🔥',
    label: 'BATTLE BACK',
    category: 'Twist',
    body: 'A Battle Back shock has been activated. Recently eliminated housemates will face off in a special competition for a chance to re-enter The Big Eye house. Alliances can shift instantly — and the returning player gets a fresh shot at the prize.',
  },
  double_eviction: {
    icon: '⚡',
    label: 'DOUBLE ELIMINATION',
    category: 'Twist',
    body: 'A Double Elimination has been triggered! Tonight\'s Leader of the House must nominate THREE housemates for elimination. After a Power of Safety competition and ceremony, the house will vote to eliminate TWO of those nominees in a single live show. Alliances shatter, plans collapse, and the game changes forever in one night.',
  },
  twist: {
    icon: '🌀',
    label: 'SHOCK',
    category: 'Shock',
    body: 'The Big Eye never plays by the same rules twice. A shock has been introduced that could change the course of the game. Pay close attention — nothing is certain, and the housemates may need to adapt quickly to survive.',
  },
  loh_comp_announcement: {
    icon: '🏆',
    label: 'LOH COMPETITION',
    category: 'Competition',
    body: 'The Leader of the House competition is about to begin. Every eligible housemate is fighting for the most powerful position in the game. The winner becomes the new Leader of the House and gains the authority to nominate two of their fellow housemates for elimination. Power is up for grabs — who will reign supreme today?',
  },
  pos_comp_announcement: {
    icon: '🎭',
    label: 'POWER OF SAFETY',
    category: 'Competition',
    body: 'It is time for the Power of Safety competition. Housemates will battle for the most powerful item in the game. The winner holds the sole power to change the nominations and potentially rewrite the day\'s outcome entirely.',
  },
};

const FALLBACK_COPY: PhaseCopy = {
  icon: '📢',
  label: 'ANNOUNCEMENT',
  category: 'The Big Eye',
  body: 'A significant moment has occurred in The Big Eye house. The housemates — and you — must decide what comes next.',
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface TvAnnouncementModalProps {
  announcementKey: string;
  open: boolean;
  onClose: () => void;
}

/**
 * TvAnnouncementModal — fullscreen phase-info modal.
 *
 * - Closes on backdrop click or ESC key.
 * - Moves focus to the card on open; full focus trap is not implemented.
 */
export default function TvAnnouncementModal({
  announcementKey,
  open,
  onClose,
}: TvAnnouncementModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Keep a ref to onClose so the fast-path always calls the latest callback
  // without the effect re-running on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Fast-path: auto-close immediately when animations are disabled.
  useEffect(() => {
    if (!open) return;
    if (document.body.classList.contains('no-animations')) {
      onCloseRef.current();
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Focus the card when opened
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const copy = PHASE_COPY[announcementKey] ?? FALLBACK_COPY;

  return createPortal(
    <div
      className="tv-ann-modal__backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="tv-ann-modal__card"
        role="dialog"
        aria-modal="true"
        aria-label={`Phase info: ${copy.label}`}
        tabIndex={-1}
        ref={cardRef}
      >
        <button
          className="tv-ann-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="tv-ann-modal__header">
          <span className="tv-ann-modal__icon" aria-hidden="true">{copy.icon}</span>
          <h2 className="tv-ann-modal__title">{copy.label}</h2>
        </div>
        <span className="tv-ann-modal__badge">{copy.category}</span>

        <hr className="tv-ann-modal__divider" />

        <div className="tv-ann-modal__body">
          {copy.body.split('\n').map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
