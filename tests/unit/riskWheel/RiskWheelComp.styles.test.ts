import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('RiskWheelComp styles', () => {
  it('allows vertical scrolling on the root container when content exceeds the viewport', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/RiskWheelComp/RiskWheelComp.css'),
      'utf8',
    );

    const ruleStart = css.indexOf('.rw-root {');
    expect(ruleStart).toBeGreaterThanOrEqual(0);

    const ruleEnd = css.indexOf('}', ruleStart);
    expect(ruleEnd).toBeGreaterThan(ruleStart);

    const rootRuleBody = css.slice(ruleStart, ruleEnd);
    const vhIndex = rootRuleBody.indexOf('max-height: 100vh;');
    const dvhIndex = rootRuleBody.indexOf('max-height: 100dvh;');

    expect(vhIndex).toBeGreaterThanOrEqual(0);
    expect(dvhIndex).toBeGreaterThan(vhIndex);
    expect(rootRuleBody).toContain('overflow-y: auto;');
    expect(rootRuleBody).toContain('-webkit-overflow-scrolling: touch;');
  });
});
