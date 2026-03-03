import React from 'react';
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
  if (!open) return null;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div
      className="confirm-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-exit-title"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="confirm-modal__card">
        <h2 id="confirm-exit-title" className="confirm-modal__title">{title}</h2>
        {description && <p className="confirm-modal__desc">{description}</p>}
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
