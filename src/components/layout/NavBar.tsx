import { NavLink } from 'react-router-dom';
import './NavBar.css';

/**
 * NavBar — bottom tab bar.
 *
 * To add a tab: append an entry to LINKS.
 * Each entry needs: to (route path), icon (emoji), label (text).
 */
const LINKS = [
  { to: '/',          icon: '🏠', label: 'Home'        },
  { to: '/game',      icon: '🎮', label: 'Game'        },
  { to: '/settings',  icon: '⚙️', label: 'Settings'    },
  { to: '/leaderboard', icon: '🏆', label: 'Leaderboard' },
  { to: '/profile',   icon: '👤', label: 'Profile'     },
] as const;

export default function NavBar() {
  return (
    <nav className="nav-bar" aria-label="Main navigation">
      {LINKS.map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `nav-bar__item${isActive ? ' nav-bar__item--active' : ''}`
          }
          aria-label={label}
        >
          <span className="nav-bar__item-inner">
            <span className="nav-bar__icon" aria-hidden="true">{icon}</span>
            <span className="nav-bar__label">{label}</span>
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
