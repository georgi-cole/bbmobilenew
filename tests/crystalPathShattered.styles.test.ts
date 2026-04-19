import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Crystal Path: Infinity wrong-tile styles', () => {
  it('keeps wrong tiles in place so they crack instead of shattering away', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/minigames/crystalPathShattered/crystalPathShattered.css'),
      'utf8',
    );

    const wrongTileRuleMatch = css.match(/\.cps-tile\.is-wrong\s*\{[\s\S]*?\}/);

    expect(wrongTileRuleMatch).not.toBeNull();
    expect(css).toContain('@keyframes cps-tile-wrong-shake {');
    expect(wrongTileRuleMatch?.[0]).toContain('animation: cps-tile-wrong-shake 0.46s ease-in-out;');
    expect(wrongTileRuleMatch?.[0]).not.toContain('cps-tile-shatter-fall');
  });
});
