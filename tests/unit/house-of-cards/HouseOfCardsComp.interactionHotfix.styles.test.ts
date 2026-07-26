import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(
  path.resolve(process.cwd(), 'src/styles/houseOfCardsInteractionFix.css'),
  'utf8',
);

describe('House of Cards interaction hotfix styles', () => {
  it('keeps face-up cards rotated while hovered or focused', () => {
    expect(css).toContain(".hoc-card[data-flipped='true']:hover .hoc-card-inner");
    expect(css).toContain('transform: rotateY(180deg)');
    expect(css).toContain('filter: none');
  });

  it('restores vertical scrolling on the complete screen', () => {
    expect(css).toContain('.minigame-complete.hoc-complete');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('-webkit-overflow-scrolling: touch');
  });
});
