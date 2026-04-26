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

    expect(css).toContain('.pf-overlay { position: fixed; inset: 0; z-index: 9200; overflow-y: auto; overscroll-behavior: contain;');
    expect(css).toContain('.pf-overlay__skip { position: fixed; top: var(--floating-corner-top-offset); right: var(--floating-corner-right-offset);');
  });
});
