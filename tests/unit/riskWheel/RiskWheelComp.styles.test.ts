import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('RiskWheelComp styles', () => {
  it('allows vertical scrolling on the root container when content exceeds the viewport', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/RiskWheelComp/RiskWheelComp.css'),
      'utf8',
    );

    const rootRule = css.match(/\.rw-root\s*\{(?<body>[\s\S]*?)\n\}/);
    expect(rootRule?.groups?.body).toContain('max-height: 100vh;');
    expect(rootRule?.groups?.body).toContain('max-height: 100dvh;');
    expect(rootRule?.groups?.body).toContain('overflow-y: auto;');
    expect(rootRule?.groups?.body).toContain('-webkit-overflow-scrolling: touch;');
  });
});
