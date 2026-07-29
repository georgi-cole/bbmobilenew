import type { Middleware } from '@reduxjs/toolkit';

const DIAGNOSTIC_KEY = 'bbmobilenew:lastGameDiagnostic';

export type GameDiagnostic = {
  capturedAt: string;
  reason: string;
  route: string;
  phase?: string;
  week?: number;
  gameId?: string | null;
  runId?: string | null;
  saveVersion?: number;
  lastAction?: string;
  activeSurface?: string;
  message?: string;
};

let latestContext: Partial<GameDiagnostic> = {};
let installed = false;
const actionHistory: Array<{ type: string; at: string }> = [];

type DiagnosticState = {
  game?: {
    seasonFinale?: unknown;
    pendingMinigame?: unknown;
    evictionOverlayPlayerId?: unknown;
    phase?: string;
    week?: number;
    gameId?: string | null;
    runId?: string | null;
    saveVersion?: number;
  };
  finale?: { isActive?: boolean };
  challenge?: { pendingChallenge?: unknown };
};
function activeSurface(state: DiagnosticState): string {
  if (state?.game?.seasonFinale) return 'season-finale';
  if (state?.finale?.isActive) return 'jury-finale';
  if (state?.challenge?.pendingChallenge) return 'challenge';
  if (state?.game?.pendingMinigame) return 'minigame';
  if (state?.game?.evictionOverlayPlayerId) return 'eviction-overlay';
  return 'main-game';
}

export const gameDiagnosticsMiddleware: Middleware = (api) => (next) => (action) => {
  const result = next(action);
  const state = api.getState() as DiagnosticState;
  const actionType =
    typeof action === 'object' && action && 'type' in action ? String(action.type) : 'unknown';
  actionHistory.push({ type: actionType, at: new Date().toISOString() });
  if (actionHistory.length > 100) actionHistory.splice(0, actionHistory.length - 100);
  latestContext = {
    phase: state?.game?.phase,
    week: state?.game?.week,
    gameId: state?.game?.gameId ?? null,
    runId: state?.game?.runId ?? null,
    saveVersion: state?.game?.saveVersion,
    lastAction: actionType,
    activeSurface: activeSurface(state),
  };
  return result;
};

export function getDiagnosticActionHistory(): ReadonlyArray<{ type: string; at: string }> {
  return actionHistory;
}

export function captureGameDiagnostic(reason: string, error?: unknown): GameDiagnostic {
  const report: GameDiagnostic = {
    capturedAt: new Date().toISOString(),
    reason,
    route: typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.hash}`,
    ...latestContext,
    message: error instanceof Error ? error.message : typeof error === 'string' ? error : undefined,
  };
  try { sessionStorage.setItem(DIAGNOSTIC_KEY, JSON.stringify(report)); } catch { /* best effort */ }
  return report;
}

export function getLastGameDiagnostic(): GameDiagnostic | null {
  try {
    const raw = sessionStorage.getItem(DIAGNOSTIC_KEY);
    return raw ? JSON.parse(raw) as GameDiagnostic : null;
  } catch {
    return null;
  }
}

export function installGameDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => captureGameDiagnostic('window-error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => captureGameDiagnostic('unhandled-rejection', event.reason));
}
