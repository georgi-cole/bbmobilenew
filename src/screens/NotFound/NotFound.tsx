import { useLocation, useNavigate } from 'react-router-dom';
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
        <button className="not-found__btn not-found__btn--primary" onClick={() => navigate('/')}>
          🏠 Go Home
        </button>
        <button className="not-found__btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
      </div>
    </div>
  );
}
