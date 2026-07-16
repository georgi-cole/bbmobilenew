import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MinigameHost timeline result sizing', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'src/components/MinigameHost/MinigameHost.css'),
    'utf8',
  );

  it('keeps the special exited-early and last-place screen on the compact result scale', () => {
    expect(css).toContain('font-size: clamp(2.65rem, 11.6vw, 3.75rem);');
    expect(css).toContain('min-height: clamp(72px, 11.5vh, 96px);');
    expect(css).toContain('min-height: clamp(48px, 6.7vh, 58px);');
    expect(css).toContain('min-height: clamp(54px, 7.2vh, 66px);');
  });
});
