import { describe, expect, it } from 'vitest';
import { buildViewportMetaContent } from '../../../src/components/layout/viewportMeta';

describe('buildViewportMetaContent', () => {
  it('preserves viewport-fit=cover when pinch zoom is enabled', () => {
    expect(buildViewportMetaContent(true)).toBe(
      'width=device-width, initial-scale=1.0, viewport-fit=cover',
    );
  });

  it('preserves viewport-fit=cover when pinch zoom is disabled', () => {
    expect(buildViewportMetaContent(false)).toBe(
      'width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover',
    );
  });
});
