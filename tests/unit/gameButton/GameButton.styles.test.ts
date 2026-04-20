import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim();
}

describe('GameButton shimmer styles', () => {
  it('clips the Play shimmer overlays to the visible primary button silhouette', () => {
    const css = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/GameButton/GameButton.css'),
        'utf8',
      ),
    );

    expect(css).toContain('.game-btn--play-shimmer { overflow: hidden; border-radius: 18px;');
    expect(css).toContain('--game-btn-play-clip-path: polygon(');
    expect(css).toContain('.game-btn--play-shimmer::before, .game-btn--play-shimmer::after {');
    expect(css).toContain('clip-path: var(--game-btn-play-clip-path);');
  });
});
