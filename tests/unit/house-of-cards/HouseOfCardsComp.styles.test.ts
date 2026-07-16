import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  'src/components/HouseOfCardsComp/HouseOfCardsComp.css',
  'utf8',
);

describe('HouseOfCardsComp card geometry', () => {
  it('gives the 3D card inner element a real card-sized box', () => {
    const rule = css.match(/\.hoc-card-inner\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(rule).toContain('display: block');
    expect(rule).toContain('width: 100%');
    expect(rule).toContain('height: 100%');
  });

  it('keeps the per-round column variable authoritative at every viewport width', () => {
    const boardRules = [...css.matchAll(/\.hoc-board\s*\{([\s\S]*?)\}/g)].map((match) => match[1]);
    const columnDeclarations = boardRules
      .flatMap((rule) => [...rule.matchAll(/grid-template-columns:\s*([^;]+);/g)])
      .map((match) => match[1]);

    expect(columnDeclarations.length).toBeGreaterThan(0);
    expect(columnDeclarations.every((value) => value.includes('var(--hoc-columns'))).toBe(true);
  });
});
