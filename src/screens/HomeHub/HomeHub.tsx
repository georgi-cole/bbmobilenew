import { useNavigate } from 'react-router-dom';
import './HomeHub.css';

/**
 * HomeHub — entry screen with BB hero branding and button stack.
 *
 * Buttons map to named routes in src/routes.tsx.
 * To add a new hub button: add an entry to HUB_BUTTONS.
 */
const HUB_BUTTONS = [
  { to: '/game',         label: '▶  Play',          variant: 'primary'   },
  { to: '/houseguests',  label: '👥 Houseguests',    variant: 'secondary' },
  { to: '/profile',      label: '👤 Profile',        variant: 'secondary' },
  { to: '/leaderboard',  label: '🏆 Leaderboard',    variant: 'secondary' },
  { to: '/diary-room',   label: '🚪 Diary Room',     variant: 'secondary' },
  { to: '/credits',      label: '🎬 Credits',        variant: 'ghost'     },
] as const;

export default function HomeHub() {
  const navigate = useNavigate();

  return (
    <div className="home-hub">
      {/* Hero / icon area */}
      <div className="home-hub__hero" aria-hidden="true">
        <div className="home-hub__logo">🏠</div>
        <h1 className="home-hub__title">Big Brother</h1>
        <p className="home-hub__subtitle">AI&nbsp;Edition</p>
      </div>

      {/* Button stack */}
      <nav className="home-hub__buttons" aria-label="Main menu">
        {HUB_BUTTONS.map(({ to, label, variant }) => (
          <button
            key={to}
            className={`home-hub__btn home-hub__btn--${variant}`}
            onClick={() => navigate(to)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
