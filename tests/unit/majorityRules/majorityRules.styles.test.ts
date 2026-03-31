import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MajorityRules styles', () => {
  it('keeps the shell vertically scrollable and wraps crowded intro avatar rails', () => {
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
    expect(shellRuleBody).toContain('overflow-y: auto;');
    expect(shellRuleBody).toContain('overscroll-behavior: contain;');
    expect(shellRuleBody).toContain('-webkit-overflow-scrolling: touch;');

    const wrappedRailRuleStart = css.indexOf('.majority-rules-avatar-rail--wrapped {');
    expect(wrappedRailRuleStart).toBeGreaterThanOrEqual(0);

    const wrappedRailRuleEnd = css.indexOf('}', wrappedRailRuleStart);
    expect(wrappedRailRuleEnd).toBeGreaterThan(wrappedRailRuleStart);

    const wrappedRailRuleBody = css.slice(wrappedRailRuleStart, wrappedRailRuleEnd);
    expect(wrappedRailRuleBody).toContain('flex-wrap: wrap;');
    expect(wrappedRailRuleBody).toContain('justify-content: center;');
    expect(wrappedRailRuleBody).toContain('overflow-x: visible;');
  });
});
