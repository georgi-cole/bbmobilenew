import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim();
}

function getRuleBlock(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);

  const end = css.indexOf('}', start);
  return css.slice(start, end);
}

describe('GameButton shimmer styles', () => {
  it('clips the Play shimmer overlays to the visible primary button silhouette', () => {
    const css = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/GameButton/GameButton.css'),
        'utf8',
      ),
    );
    const shimmerRule = getRuleBlock(css, '.game-btn--play-shimmer');
    const shimmerOverlayRule = getRuleBlock(
      css,
      '.game-btn--play-shimmer::before, .game-btn--play-shimmer::after',
    );

    expect(shimmerRule).toContain('overflow: hidden;');
    expect(shimmerRule).toContain('border-radius: 18px;');
    expect(shimmerRule).toContain('--game-btn-play-clip-path: polygon(');
    expect(shimmerOverlayRule).toContain('clip-path: var(--game-btn-play-clip-path);');
  });
});
