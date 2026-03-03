import { useEffect } from 'react';
import './KolequantSplash.css';

interface Props {
  duration?: number; // total visible time in ms including fade in/out
  onFinish?: () => void;
}

// Logo lives at public/assets/kolequant.png — use BASE_URL so it works with any Vite base path.
const LOGO_SRC = `${import.meta.env.BASE_URL}assets/kolequant.png`;

export default function KolequantSplash({ duration = 1200, onFinish }: Props) {
  // Animation sequence: fade in (300ms), hold (duration - 600ms), fade out (300ms)
  useEffect(() => {
    const t = setTimeout(() => onFinish && onFinish(), duration);
    return () => clearTimeout(t);
  }, [duration, onFinish]);

  return (
    <div className="kq-splash" aria-hidden="true">
      <div className="kq-splash__center">
        <img src={LOGO_SRC} alt="Kolequant" className="kq-splash__logo" draggable={false} decoding="async" />
        <div className="kq-splash__copyright">© 2006</div>
      </div>
    </div>
  );
}
