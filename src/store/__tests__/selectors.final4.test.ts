import { describe, expect, it } from 'vitest';
import { selectAdvanceEnabled, selectIsWaitingForInput } from '../selectors';

function stateForPhase(phase: string) {
  return {
    game: { phase },
  } as unknown as Parameters<typeof selectIsWaitingForInput>[0];
}

describe('Final 4 input guard', () => {
  it('blocks the Play action while the mandatory Final 4 sequence is active', () => {
    const state = stateForPhase('final4_eviction');

    expect(selectIsWaitingForInput(state)).toBe(true);
    expect(selectAdvanceEnabled(state)).toBe(false);
  });

  it('does not block an ordinary non-interactive phase', () => {
    const state = stateForPhase('week_start');

    expect(selectIsWaitingForInput(state)).toBe(false);
    expect(selectAdvanceEnabled(state)).toBe(true);
  });
});
