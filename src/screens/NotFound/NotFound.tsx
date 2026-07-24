import { useLocation, useNavigate } from 'react-router';
import './NotFound.css';

export default function NotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <div className="not-found">
      <div className="not-found__code" aria-hidden="true">404</div>
      <h1 className="not-found__title">Page Not Found</h1>
      <p className="not-found__path">
        <code>{pathname}</code>
      </p>
      <div className="not-found__actions">
        <button type="button" className="not-found__btn game-button game-button--primary" onClick={() => navigate('/')}>
          🏠 Go Home
        </button>
        <button type="button" className="not-found__btn game-button game-button--secondary" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </div>
    </div>
  );
}
