import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim();
}

describe('desktop app shell framing styles', () => {
  it('centers the root and constrains the shell to a phone-sized frame on fine-pointer desktops', () => {
    const globalCss = normalizeCss(readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8'));
    const appShellCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/layout/AppShell.css'), 'utf8'),
    );

    expect(globalCss).toContain('@media (min-width: 768px) and (pointer: fine) {');
    expect(globalCss).toContain('body { min-height: 100dvh; }');
    expect(globalCss).toContain(
      '#root { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px; }',
    );

    expect(appShellCss).toContain('@media (min-width: 768px) and (pointer: fine) {');
    expect(appShellCss).toContain('width: min(calc(100vw - 48px), 390px);');
    expect(appShellCss).toContain('max-width: 390px;');
    expect(appShellCss).toContain('height: auto;');
    expect(appShellCss).toContain('max-height: min(calc(100dvh - 48px), 844px);');
    expect(appShellCss).toContain('aspect-ratio: 390 / 844;');
    expect(appShellCss).toContain('border-radius: 32px;');
  });
});
