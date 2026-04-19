import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Crystal Path: Infinity wrong-tile styles', () => {
  it('keeps wrong tiles in place so they crack instead of shattering away', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/minigames/crystalPathShattered/crystalPathShattered.css'),
      'utf8',
    );

    const wrongTileRule = /\.cps-tile\.is-wrong\s*\{[\s\S]*?animation:\s*cps-tile-wrong-shake 0\.46s ease-in-out;[\s\S]*?\}/;

    expect(css).toContain('@keyframes cps-tile-wrong-shake {');
    expect(css).toMatch(wrongTileRule);
    expect(css).not.toContain('animation: cps-tile-shatter-fall 0.7s ease forwards;');
  });
});
