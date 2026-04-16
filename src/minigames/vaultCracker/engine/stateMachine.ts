import type { VaultCrackerEnginePhase, VaultCrackerRuntimeState } from './types';

export function isInteractivePhase(phase: VaultCrackerEnginePhase): boolean {
  return phase === 'idle' || phase === 'active' || phase === 'failAnimating';
}

export function setPhase(state: VaultCrackerRuntimeState, nextPhase: VaultCrackerEnginePhase): void {
  if (state.phase === nextPhase) return;
  state.phase = nextPhase;
  state.phaseElapsedMs = 0;
}
