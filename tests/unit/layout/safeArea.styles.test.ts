import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim();
}

describe('safe-area layout styles', () => {
  it('defines a shared top safe-area fallback and applies it in the app shell', () => {
    const globalCss = normalizeCss(readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8'));
    const appShellCss = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/layout/AppShell.css'),
        'utf8',
      ),
    );
    const creditsCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/Credits/Credits.css'), 'utf8'),
    );
    const seasonRecapCss = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/SeasonRecapCinematic/SeasonRecapCinematic.css'),
        'utf8',
      ),
    );
    const juryRevealCss = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/JuryPhaseRevealOverlay/JuryPhaseRevealOverlay.css'),
        'utf8',
      ),
    );
    const evictionCss = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/Eviction/SpotlightEvictionOverlay.css'),
        'utf8',
      ),
    );
    const minigameHostCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/MinigameHost/MinigameHost.css'), 'utf8'),
    );

    expect(globalCss).toContain('--safe-area-inset-top: env(safe-area-inset-top, 0px);');
    expect(globalCss).toContain('--safe-area-inset-left: env(safe-area-inset-left, 0px);');
    expect(globalCss).toContain('--safe-area-inset-right: env(safe-area-inset-right, 0px);');
    expect(globalCss).toContain('--app-safe-area-top-fallback: 0px;');
    expect(globalCss).toContain(
      '--app-safe-area-top: max(var(--app-safe-area-top-fallback), var(--safe-area-inset-top));',
    );
    expect(globalCss).toContain(
      '--app-safe-area-top-extra: max(0px, calc(var(--app-safe-area-top) - 16px));',
    );
    expect(globalCss).toContain(
      '--floating-corner-top-offset: max(12px, calc(var(--app-safe-area-top) + 8px));',
    );
    expect(globalCss).toContain(
      '--floating-corner-left-offset: max(16px, calc(var(--safe-area-inset-left) + 16px));',
    );
    expect(globalCss).toContain(
      '--floating-corner-right-offset: max(16px, calc(var(--safe-area-inset-right) + 16px));',
    );
    expect(globalCss).toContain('html.is-capacitor,');
    expect(globalCss).toContain('html.is-chrome-android {');
    expect(globalCss).toContain('--app-safe-area-top-fallback: 16px;');
    expect(appShellCss).toContain('padding-top: var(--app-safe-area-top);');
    expect(appShellCss).toContain('padding-bottom: var(--safe-area-inset-bottom);');
    expect(creditsCss).toContain('top: var(--floating-corner-top-offset);');
    expect(creditsCss).toContain('right: var(--floating-corner-right-offset);');
    expect(seasonRecapCss).toContain('top: var(--floating-corner-top-offset);');
    expect(seasonRecapCss).toContain('right: var(--floating-corner-right-offset);');
    expect(juryRevealCss).toContain('top: var(--floating-corner-top-offset);');
    expect(juryRevealCss).toContain('right: var(--floating-corner-right-offset);');
    expect(evictionCss).toContain('top: var(--floating-corner-top-offset);');
    expect(evictionCss).toContain('left: var(--floating-corner-left-offset);');
    expect(minigameHostCss).toContain('top: var(--floating-corner-top-offset);');
    expect(minigameHostCss).toContain('right: var(--floating-corner-right-offset);');
  });

  it('keeps explicit back-header screens aligned to the shared 16px baseline', () => {
    const diaryRoomCss = readFileSync(
      resolve(process.cwd(), 'src/screens/DiaryRoom/DiaryRoom.css'),
      'utf8',
    );
    const gameDebugCss = readFileSync(
      resolve(process.cwd(), 'src/screens/GameDebug/GameDebug.css'),
      'utf8',
    );

    expect(diaryRoomCss).toContain('padding: 16px 16px 10px;');
    expect(gameDebugCss).toContain('padding: 1rem 1rem 0.5rem;');
  });
});
