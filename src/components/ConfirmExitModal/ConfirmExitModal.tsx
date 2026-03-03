import { useEffect, useId, useRef } from 'react';
import './ConfirmExitModal.css';

interface Props {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Minimal confirmation modal used by NavBar for guarding Home navigation.
 * Keeps markup simple so it can fit the app's existing modal/overlay system.
 */
export default function ConfirmExitModal({
  open,
  title = 'Confirm',
  description,
  confirmLabel = 'Exit',
  cancelLabel = 'Stay',
  onConfirm,
  onCancel,
}: Props) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const cardRef = useRef<HTMLDivElement>(null);

  // Document-level ESC handler — fires even when focus is outside the modal.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  // Move focus into the modal card when it opens.
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="confirm-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      <div className="confirm-modal__card" tabIndex={-1} ref={cardRef}>
        <h2 id={titleId} className="confirm-modal__title">{title}</h2>
        {description && <p id={descId} className="confirm-modal__desc">{description}</p>}
        <div className="confirm-modal__actions">
          <button type="button" className="confirm-modal__btn confirm-modal__btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="confirm-modal__btn confirm-modal__btn--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
