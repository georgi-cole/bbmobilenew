import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MemoryColorsComp styles', () => {
  it('keeps the results screen top-aligned and the standings list scrollable on short viewports', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/MemoryColorsComp/MemoryColorsComp.css'),
      'utf8',
    );

    const hostRuleStart = css.indexOf('.mc-host--results {');
    expect(hostRuleStart).toBeGreaterThanOrEqual(0);
    const hostRuleEnd = css.indexOf('}', hostRuleStart);
    const hostRuleBody = css.slice(hostRuleStart, hostRuleEnd);

    expect(hostRuleBody).toContain('justify-content: flex-start;');
    expect(hostRuleBody).toContain('overflow-y: auto;');
    expect(hostRuleBody).toContain('-webkit-overflow-scrolling: touch;');

    const panelRuleStart = css.indexOf('.mc-results-panel {');
    expect(panelRuleStart).toBeGreaterThanOrEqual(0);
    const panelRuleEnd = css.indexOf('}', panelRuleStart);
    const panelRuleBody = css.slice(panelRuleStart, panelRuleEnd);

    const vhIndex = panelRuleBody.indexOf('max-height: min(760px, calc(100vh - 40px));');
    const dvhIndex = panelRuleBody.indexOf('max-height: min(760px, calc(100dvh - 40px));');
    expect(vhIndex).toBeGreaterThanOrEqual(0);
    expect(dvhIndex).toBeGreaterThan(vhIndex);
    expect(panelRuleBody).toContain('overflow: hidden;');

    const scrollRuleStart = css.indexOf('.mc-results-scroll {');
    expect(scrollRuleStart).toBeGreaterThanOrEqual(0);
    const scrollRuleEnd = css.indexOf('}', scrollRuleStart);
    const scrollRuleBody = css.slice(scrollRuleStart, scrollRuleEnd);

    expect(scrollRuleBody).toContain('flex: 1 1 auto;');
    expect(scrollRuleBody).toContain('min-height: 0;');
    expect(scrollRuleBody).toContain('overflow-y: auto;');
    expect(scrollRuleBody).toContain('overscroll-behavior: contain;');
  });

  it('adds lightweight results polish without affecting gameplay interactions', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/MemoryColorsComp/MemoryColorsComp.css'),
      'utf8',
    );

    expect(css).toContain('.mc-results-panel::before');
    expect(css).toContain('@keyframes mc-results-sheen');
    expect(css).toContain('@keyframes mc-results-row-enter');
    expect(css).toContain('animation-delay: calc(var(--mc-row-index, 0) * 45ms);');
  });
});
