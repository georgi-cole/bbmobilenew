import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('MemoryColorsComp styles', () => {
  it('uses a full results page without a nested standings scroller', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/MemoryColorsComp/MemoryColorsComp.css'),
      'utf8',
    );

    const hostRuleStart = css.indexOf('.mc-host--results {');
    expect(hostRuleStart).toBeGreaterThanOrEqual(0);
    const hostRuleEnd = css.indexOf('}', hostRuleStart);
    const hostRuleBody = css.slice(hostRuleStart, hostRuleEnd);

    expect(hostRuleBody).toContain('justify-content: flex-start;');
    expect(hostRuleBody).toContain('overflow: visible;');

    const panelRuleStart = css.indexOf('.mc-results-panel {');
    expect(panelRuleStart).toBeGreaterThanOrEqual(0);
    const panelRuleEnd = css.indexOf('}', panelRuleStart);
    const panelRuleBody = css.slice(panelRuleStart, panelRuleEnd);

    expect(panelRuleBody).toContain('max-width: none;');
    expect(panelRuleBody).toContain('overflow-y: auto;');
    expect(panelRuleBody).not.toContain('max-height:');

    const scrollRuleStart = css.indexOf('.mc-results-scroll {');
    expect(scrollRuleStart).toBeGreaterThanOrEqual(0);
    const scrollRuleEnd = css.indexOf('}', scrollRuleStart);
    const scrollRuleBody = css.slice(scrollRuleStart, scrollRuleEnd);

    expect(scrollRuleBody).toContain('flex: 1 1 auto;');
    expect(scrollRuleBody).toContain('min-height: 0;');
    expect(scrollRuleBody).toContain('overflow: visible;');
    expect(scrollRuleBody).not.toContain('overflow-y: auto;');
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
