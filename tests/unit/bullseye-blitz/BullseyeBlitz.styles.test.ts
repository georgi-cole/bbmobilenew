import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BullseyeBlitz styles', () => {
  it('keeps the overlay and card vertically scrollable on short viewports', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/BullseyeBlitz/BullseyeBlitz.css'),
      'utf8',
    );

    const rootRuleStart = css.indexOf('.bbl {');
    expect(rootRuleStart).toBeGreaterThanOrEqual(0);

    const rootRuleEnd = css.indexOf('}', rootRuleStart);
    expect(rootRuleEnd).toBeGreaterThan(rootRuleStart);

    const rootRuleBody = css.slice(rootRuleStart, rootRuleEnd);
    expect(rootRuleBody).toContain('overflow-y: auto;');
    expect(rootRuleBody).toContain('-webkit-overflow-scrolling: touch;');

    const cardRuleStart = css.indexOf('.bbl__card {');
    expect(cardRuleStart).toBeGreaterThanOrEqual(0);

    const cardRuleEnd = css.indexOf('}', cardRuleStart);
    expect(cardRuleEnd).toBeGreaterThan(cardRuleStart);

    const cardRuleBody = css.slice(cardRuleStart, cardRuleEnd);
    const vhIndex = cardRuleBody.indexOf('max-height: calc(100vh - 32px);');
    const dvhIndex = cardRuleBody.indexOf('max-height: calc(100dvh - 32px);');

    expect(vhIndex).toBeGreaterThanOrEqual(0);
    expect(dvhIndex).toBeGreaterThan(vhIndex);
    expect(cardRuleBody).toContain('margin-block: auto;');
    expect(cardRuleBody).toContain('overflow-y: auto;');
    expect(cardRuleBody).toContain('overscroll-behavior: contain;');
  });
});
