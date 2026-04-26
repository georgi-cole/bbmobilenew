import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim();
}

describe('PublicFavoriteOverlay styles', () => {
  it('keeps the overlay scrollable and the skip control pinned on screen', () => {
    const css = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/PublicFavoriteOverlay/PublicFavoriteOverlay.css'),
        'utf8',
      ),
    );

    expect(css).toContain('.pf-overlay {');
    expect(css).toContain('overflow-y: auto;');
    expect(css).toContain('overscroll-behavior: contain;');
    expect(css).toContain('.pf-overlay__skip {');
    expect(css).toContain('position: fixed;');
    expect(css).toContain('top: var(--floating-corner-top-offset);');
    expect(css).toContain('right: var(--floating-corner-right-offset);');
  });
});
