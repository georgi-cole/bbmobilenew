import './HubLoadingOverlay.css';

interface HubLoadingOverlayProps {
  progress: number;
  status: string;
}

export default function HubLoadingOverlay({ progress, status }: HubLoadingOverlayProps) {
  const clampedProgress = Math.max(0, Math.min(progress, 100));

  return (
    <div
      className="hub-loading-overlay"
      role="status"
      aria-live="polite"
      aria-label={`${status} ${clampedProgress}%`}
    >
      <div className="hub-loading-overlay__card">
        <p className="hub-loading-overlay__eyebrow">Kolequant</p>
        <h2 className="hub-loading-overlay__title">{status}</h2>
        <p className="hub-loading-overlay__copy">
          Backgrounds, button art, and utility chips are being prepared.
        </p>

        <div className="hub-loading-overlay__bar-track" aria-hidden="true">
          <div
            className="hub-loading-overlay__bar-fill"
            style={{ width: `${clampedProgress}%` }}
          />
        </div>

        <div className="hub-loading-overlay__meta" aria-hidden="true">
          <span>Preparing screen</span>
          <span>{clampedProgress}%</span>
        </div>
      </div>
    </div>
  );
}
