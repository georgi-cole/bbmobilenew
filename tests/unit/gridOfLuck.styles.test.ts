import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  resolve(process.cwd(), 'src/components/GridOfLuck/GridOfLuck.css'),
  'utf8',
);

describe('Grid of Luck responsive layout', () => {
  it('uses the game container width instead of the browser viewport for arena breakpoints', () => {
    expect(css).toMatch(/container-type:\s*inline-size/);
    expect(css).toMatch(/@container grid-of-luck \(min-width:\s*960px\)/);
    expect(css).toMatch(/@container grid-of-luck \(max-width:\s*719px\)/);
  });

  it('keeps the event card and Continue Ritual action visible on phone widths', () => {
    const phoneBlock = css.match(/@container grid-of-luck \(max-width:\s*430px\)\s*\{([\s\S]*)$/)?.[1] ?? '';

    expect(phoneBlock).not.toMatch(/\.grid-of-luck__event-card[\s\S]*display:\s*none/);
    expect(css).toMatch(/\.grid-of-luck__event-action\s*\{[\s\S]*width:\s*100%/);
  });
});
