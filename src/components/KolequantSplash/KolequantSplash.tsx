import { useEffect, type CSSProperties } from 'react';
import './KolequantSplash.css';

interface Props {
  duration?: number; // total visible time in ms including fade in/out
  onFinish?: () => void;
}

// Logo lives at public/assets/kolequant.png — use BASE_URL so it works with any Vite base path.
const LOGO_SRC = `${import.meta.env.BASE_URL}assets/kolequant.png`;

export default function KolequantSplash({ duration = 2000, onFinish }: Props) {
  // Animation sequence: fade in (300ms), hold (duration - 600ms), fade out (300ms)
  useEffect(() => {
    const t = setTimeout(() => onFinish && onFinish(), duration);
    return () => clearTimeout(t);
  }, [duration, onFinish]);

  const splashStyle = {
    '--kq-splash-duration': `${duration}ms`,
  } as CSSProperties;

  return (
    <div className="kq-splash" style={splashStyle} aria-hidden="true">
      <img src={LOGO_SRC} alt="Kolequant" className="kq-splash__logo" draggable={false} decoding="async" />
      {/* Copyright pinned to the bottom of the splash; animates with the logo */}
      <div className="kq-splash__copyright">© 2026</div>
    </div>
  );
}
