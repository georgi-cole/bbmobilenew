import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MajorityRules styles', () => {
  it('keeps the shell vertically scrollable on mobile-sized viewports', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/MajorityRulesComp/MajorityRulesComp.css'),
      'utf8',
    );

    const shellRuleStart = css.indexOf('.majority-rules-shell {');
    expect(shellRuleStart).toBeGreaterThanOrEqual(0);

    const shellRuleEnd = css.indexOf('}', shellRuleStart);
    expect(shellRuleEnd).toBeGreaterThan(shellRuleStart);

    const shellRuleBody = css.slice(shellRuleStart, shellRuleEnd);
    const vhIndex = shellRuleBody.indexOf('max-height: 100vh;');
    const dvhIndex = shellRuleBody.indexOf('max-height: 100dvh;');

    expect(vhIndex).toBeGreaterThanOrEqual(0);
    expect(dvhIndex).toBeGreaterThan(vhIndex);
    expect(shellRuleBody).toContain('overflow-x: hidden;');
    expect(shellRuleBody).toContain('overflow-y: auto;');
    expect(shellRuleBody).toContain('overscroll-behavior: contain;');
    expect(shellRuleBody).toContain('-webkit-overflow-scrolling: touch;');
  });

  it('wraps crowded intro avatar rails into centered rows', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/MajorityRulesComp/MajorityRulesComp.css'),
      'utf8',
    );

    const wrappedRailRuleStart = css.indexOf('.majority-rules-avatar-rail--wrapped {');
    expect(wrappedRailRuleStart).toBeGreaterThanOrEqual(0);

    const wrappedRailRuleEnd = css.indexOf('}', wrappedRailRuleStart);
    expect(wrappedRailRuleEnd).toBeGreaterThan(wrappedRailRuleStart);

    const wrappedRailRuleBody = css.slice(wrappedRailRuleStart, wrappedRailRuleEnd);
    expect(wrappedRailRuleBody).toContain('flex-wrap: wrap;');
    expect(wrappedRailRuleBody).toContain('justify-content: center;');
    expect(wrappedRailRuleBody).toContain('overflow-x: visible;');
  });

  it('lets tall phase cards scroll vertically so the action buttons stay reachable', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/MajorityRulesComp/MajorityRulesComp.css'),
      'utf8',
    );

    const cardRuleStart = css.indexOf('.majority-rules-card {');
    expect(cardRuleStart).toBeGreaterThanOrEqual(0);

    const cardRuleEnd = css.indexOf('}', cardRuleStart);
    expect(cardRuleEnd).toBeGreaterThan(cardRuleStart);

    const cardRuleBody = css.slice(cardRuleStart, cardRuleEnd);
    expect(cardRuleBody).toContain('overflow-x: hidden;');
    expect(cardRuleBody).toContain('overflow-y: auto;');
    expect(cardRuleBody).toContain('max-height: 100%;');
    expect(cardRuleBody).toContain('min-height: 0;');
    expect(cardRuleBody).toContain('-webkit-overflow-scrolling: touch;');
  });
});
