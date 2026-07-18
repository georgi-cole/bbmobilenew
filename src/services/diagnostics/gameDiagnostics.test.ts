import { beforeEach, describe, expect, it } from 'vitest';
import { captureGameDiagnostic, getLastGameDiagnostic } from './gameDiagnostics';

describe('game diagnostics', () => {
  beforeEach(() => sessionStorage.clear());

  it('stores a privacy-safe support report for the current route', () => {
    const report = captureGameDiagnostic('route-error', new Error('render failed'));

    expect(report.reason).toBe('route-error');
    expect(report.message).toBe('render failed');
    expect(getLastGameDiagnostic()).toEqual(report);
    expect(JSON.stringify(report)).not.toContain('players');
  });
});
