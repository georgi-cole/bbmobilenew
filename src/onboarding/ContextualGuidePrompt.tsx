import { createPortal } from 'react-dom'
import './SeasonStartOnboardingController.css'

export default function ContextualGuidePrompt({
  eyebrow,
  title,
  body,
  onComplete,
}: {
  eyebrow: string
  title: string
  body: string
  onComplete: () => void
}) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="season-tutorial-prompt" role="presentation">
      <div className="season-tutorial-prompt__backdrop" aria-hidden="true" />
      <section
        className="season-tutorial-prompt__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contextual-guide-title"
        aria-describedby="contextual-guide-copy"
      >
        <span className="season-tutorial-prompt__eyebrow">{eyebrow}</span>
        <h2 id="contextual-guide-title">{title}</h2>
        <p id="contextual-guide-copy">{body}</p>
        <div className="season-tutorial-prompt__actions">
          <button
            type="button"
            className="season-tutorial__primary"
            onClick={onComplete}
            autoFocus
          >
            Got it
          </button>
        </div>
      </section>
    </div>,
    document.body
  )
}
