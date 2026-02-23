import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './TvAnnouncementModal.css';

// ─── Phase copy ───────────────────────────────────────────────────────────────

interface PhaseCopy {
  label: string;
  body: string;
}

const PHASE_COPY: Record<string, PhaseCopy> = {
  week_start: {
    label: 'NEW WEEK',
    body: 'A new week begins in the Big Brother house. Houseguests reset their social games and strategise before the Head of Household competition. Alliances shift, targets are reconsidered, and the house dynamics evolve.',
  },
  nomination_ceremony: {
    label: 'NOMINATIONS',
    body: 'The Head of Household gathers all houseguests and places two nominees on the block for potential eviction. Nominees have the chance to save themselves by winning the Power of Veto. Every speech and every alliance is tested in this moment.',
  },
  veto_competition: {
    label: 'VETO COMP',
    body: 'Six players compete for the Power of Veto — the most powerful item in the game. The winner decides whether to keep the nominations the same or pull a nominee off the block, forcing the HOH to name a replacement.',
  },
  veto_ceremony: {
    label: 'VETO CEREMONY',
    body: 'The Power of Veto holder announces their decision: use the Veto to save a nominee, or keep the nominations unchanged. When used, the HOH must immediately name a replacement nominee — and they cannot choose the outgoing HOH.',
  },
  live_eviction: {
    label: 'LIVE EVICTION',
    body: 'The house votes live to evict one of the current nominees. All eligible voters cast their ballots privately. The nominee with the most votes is evicted and leaves the house immediately to join the jury (or go home, pre-jury). In a tie, the Head of Household casts the deciding vote.',
  },
  final4: {
    label: 'FINAL 4',
    body: 'Only four players remain. The stakes are at their highest — every competition, every vote, every conversation could determine who makes it to the Final 3. At this stage there is no longer a traditional veto ceremony; the POV holder is the sole vote to evict.',
  },
  final3: {
    label: 'FINAL 3',
    body: 'The Final 3 have earned their place. They now compete in the legendary three-part Head of Household competition. Part 1 is an endurance battle. Part 2 tests skill and memory. The winners of Parts 1 and 2 face off in Part 3, and the winner becomes the Final Head of Household.',
  },
  final_hoh: {
    label: 'FINAL HOH',
    body: 'The Final Head of Household holds the most consequential power in the game. They alone decide who sits beside them in the Final 2 — and who is sent to the jury just one step from the prize. This single choice often defines legacies.',
  },
  jury: {
    label: 'JURY VOTES',
    body: 'The jury — made up of the last evicted houseguests — casts their votes to award the grand prize. Each juror votes for the finalist they believe most deserves to win based on game play, social game, and competition performance. The finalist with the most jury votes is crowned the winner of Big Brother.',
  },
  twist: {
    label: 'TWIST',
    body: 'Big Brother never plays by the same rules twice. A twist has been introduced that could change the course of the game. Pay close attention — nothing is certain, and the houseguests may need to adapt quickly to survive.',
  },
};

const FALLBACK_COPY: PhaseCopy = {
  label: 'ANNOUNCEMENT',
  body: 'A significant moment has occurred in the Big Brother house. The houseguests — and you — must decide what comes next.',
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

        <h2 className="tv-ann-modal__title">{copy.label}</h2>
        <span className="tv-ann-modal__badge">{announcementKey}</span>

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
