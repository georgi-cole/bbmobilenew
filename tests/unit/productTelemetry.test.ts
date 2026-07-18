import { beforeEach, describe, expect, it } from 'vitest';
import {
  configureProductTelemetry,
  readBufferedProductEvents,
  trackProductEvent,
} from '../../src/services/liveOps/productTelemetry';

describe('product telemetry', () => {
  beforeEach(() => sessionStorage.clear());

  it('buffers sampled privacy-safe product events without requiring a collector', () => {
    configureProductTelemetry({ enabled: true, samplePercentage: 100 });
    trackProductEvent('game_phase_view', { phase: 'social_1', week: 2 });

    expect(readBufferedProductEvents()).toEqual([
      expect.objectContaining({
        name: 'game_phase_view',
        properties: { phase: 'social_1', week: 2 },
      }),
    ]);
  });

  it('does not collect events when operations telemetry is disabled', () => {
    configureProductTelemetry({ enabled: false, samplePercentage: 100 });
    trackProductEvent('screen_view', { route: '#/game' });
    expect(readBufferedProductEvents()).toEqual([]);
  });
});
