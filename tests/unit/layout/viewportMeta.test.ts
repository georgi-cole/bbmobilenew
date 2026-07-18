import { describe, expect, it } from 'vitest';
import { buildViewportMetaContent } from '../../../src/components/layout/viewportMeta';

describe('buildViewportMetaContent', () => {
  it('keeps native pinch zoom available in the standard range', () => {
    const content = buildViewportMetaContent(false);
    expect(content).toContain('maximum-scale=5');
    expect(content).toContain('viewport-fit=cover');
    expect(content).not.toContain('user-scalable=no');
  });
  it('offers an expanded range when enhanced zoom is enabled', () => {
    expect(buildViewportMetaContent(true)).toContain('maximum-scale=10');
  });
});