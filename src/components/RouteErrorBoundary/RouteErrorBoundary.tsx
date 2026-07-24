import { useEffect, useState } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { captureGameDiagnostic, type GameDiagnostic } from '../../services/diagnostics/gameDiagnostics';
import './RouteErrorBoundary.css';

export default function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();
  const [diagnostic, setDiagnostic] = useState<GameDiagnostic | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDiagnostic(captureGameDiagnostic('route-error', error));
  }, [error]);

  let status: number | undefined;
  let message = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    message = error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
    if (import.meta.env.DEV) stack = error.stack;
  }

  return (
    <div className="route-error">
      <div className="route-error__code" aria-hidden="true">{status ?? '!'}</div>
      <h1 className="route-error__title">Something went wrong</h1>
      <p className="route-error__message">{message}</p>
      {stack && <pre className="route-error__stack">{stack}</pre>}
      <div className="route-error__actions">
        <button className="route-error__btn route-error__btn--primary" onClick={() => navigate('/')}>
          Go Home
        </button>
        <button className="route-error__btn" onClick={() => window.location.reload()}>
          Reload
        </button>
        {diagnostic && (
          <button
            className="route-error__btn"
            onClick={() => {
              void navigator.clipboard?.writeText(JSON.stringify(diagnostic, null, 2)).then(() => setCopied(true));
            }}
          >
            {copied ? 'Diagnostic copied' : 'Copy diagnostic'}
          </button>
        )}
      </div>
    </div>
  );
}
