import './PortraitOrientationGuard.css';

/** Friendly browser fallback when orientation locking is unavailable. */
export default function PortraitOrientationGuard() {
  return (
    <aside className="portrait-orientation-guard" role="status" aria-live="polite">
      <div className="portrait-orientation-guard__phone" aria-hidden="true">
        <span />
      </div>
      <div>
        <p className="portrait-orientation-guard__eyebrow">Best played upright</p>
        <h1>Rotate your device</h1>
        <p>This game is designed for portrait mode. Your season will be waiting.</p>
      </div>
    </aside>
  );
}
