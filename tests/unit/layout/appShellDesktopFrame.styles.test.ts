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
    const homeHubCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/HomeHub/HomeHub.css'), 'utf8'),
    );

    expect(globalCss).toContain('@media (min-width: 768px) and (pointer: fine) {');
    expect(globalCss).toContain('body { min-height: 100dvh; }');
    expect(globalCss).toContain(
      '#root { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 24px; }',
    );

    expect(appShellCss).toContain('@media (min-width: 768px) and (pointer: fine) {');
    expect(appShellCss).toContain('--desktop-shell-frame-inset: 48px;');
    expect(appShellCss).toContain('--desktop-shell-width: 393px;');
    expect(appShellCss).toContain('--desktop-shell-height: 852px;');
    expect(appShellCss).toContain('--desktop-shell-ratio: 393 / 852;');
    expect(appShellCss).toContain(
      'width: min(calc(100vw - var(--desktop-shell-frame-inset)), var(--desktop-shell-width));',
    );
    expect(appShellCss).toContain('height: auto;');
    expect(appShellCss).toContain(
      'max-height: min(calc(100dvh - var(--desktop-shell-frame-inset)), var(--desktop-shell-height));',
    );
    expect(appShellCss).toContain('aspect-ratio: var(--desktop-shell-ratio);');
    expect(appShellCss).not.toContain('border-radius: 32px;');
    expect(appShellCss).not.toContain('box-shadow: 0 24px 72px rgba(0, 0, 0, 0.45);');

    expect(homeHubCss).toContain(
      '.homehub-shell { position: relative; min-height: 100%; height: 100%; overflow: hidden;',
    );
    expect(homeHubCss).toContain(
      '.homehub-frame { position: relative; width: 100%; max-width: 480px; min-height: 100%; height: 100%;',
    );
    expect(homeHubCss).not.toContain('min-height: 100dvh;');
    expect(homeHubCss).not.toContain('height: 100dvh;');
  });
});
