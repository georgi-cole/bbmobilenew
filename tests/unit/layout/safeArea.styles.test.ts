import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim();
}

describe('safe-area layout styles', () => {
  it('defines a shared top safe-area fallback and applies it in the app shell', () => {
    const globalCss = normalizeCss(readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8'));
    const indexHtml = normalizeCss(readFileSync(resolve(process.cwd(), 'index.html'), 'utf8'));
    const appShellCss = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/layout/AppShell.css'),
        'utf8',
      ),
    );
    const navBarCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/layout/NavBar.css'), 'utf8'),
    );
    const gameBottomNavCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/GameBottomNav/GameBottomNav.css'), 'utf8'),
    );
    const mainTsx = normalizeCss(readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8'));
    const settingsAdminTsx = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/SettingsAdmin/SettingsAdmin.tsx'), 'utf8'),
    );
    const viewportMetaTs = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/utils/viewportMeta.ts'), 'utf8'),
    );
    const minigameHostCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/MinigameHost/MinigameHost.css'), 'utf8'),
    );
    const minigameRulesCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/MinigameRules/MinigameRules.css'), 'utf8'),
    );
    const quickTapCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/QuickTapRace/QuickTapRace.css'), 'utf8'),
    );
    const pressurePlankCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/PressurePlank/PressurePlank.css'), 'utf8'),
    );
    const bullseyeCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/BullseyeBlitz/BullseyeBlitz.css'), 'utf8'),
    );
    const travelingDotsCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/TravelingDots/TravelingDots.css'), 'utf8'),
    );
    const spectatorCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/ui/SpectatorView/styles.css'), 'utf8'),
    );
    const wildcardWesternCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/WildcardWesternComp/WildcardWesternComp.css'), 'utf8'),
    );
    const timingBarCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/TimingBar/TimingBar.css'), 'utf8'),
    );

    expect(indexHtml).toContain('viewport-fit=cover');
    expect(mainTsx).toContain("buildViewportMetaContent(initEnableZoom)");
    expect(settingsAdminTsx).toContain("buildViewportMetaContent(enableZoom)");
    expect(viewportMetaTs).toContain("'width=device-width, initial-scale=1.0, viewport-fit=cover'");
    expect(viewportMetaTs).toContain("'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no'");
    expect(globalCss).toContain('--safe-area-inset-top: env(safe-area-inset-top, 0px);');
    expect(globalCss).toContain('--safe-area-inset-left: env(safe-area-inset-left, 0px);');
    expect(globalCss).toContain('--safe-area-inset-right: env(safe-area-inset-right, 0px);');
    expect(globalCss).toContain('--app-safe-area-top-fallback: 0px;');
    expect(globalCss).toContain('--safe-top: max(var(--app-safe-area-top-fallback), var(--safe-area-inset-top));');
    expect(globalCss).toContain('--safe-left: var(--safe-area-inset-left);');
    expect(globalCss).toContain('--safe-right: var(--safe-area-inset-right);');
    expect(globalCss).toContain('--safe-bottom: var(--safe-area-inset-bottom);');
    expect(globalCss).toContain(
      '--app-safe-area-top: var(--safe-top);',
    );
    expect(globalCss).toContain(
      '--app-safe-area-top-extra: max(0px, calc(var(--app-safe-area-top) - 16px));',
    );
    expect(globalCss).toContain('--fullscreen-safe-top: var(--safe-top);');
    expect(globalCss).toContain('--fullscreen-safe-right: var(--safe-right);');
    expect(globalCss).toContain('--fullscreen-safe-bottom: var(--safe-bottom);');
    expect(globalCss).toContain('--fullscreen-safe-left: var(--safe-left);');
    expect(globalCss).toContain(
      '--fullscreen-safe-height: calc( 100dvh - var(--fullscreen-safe-top) - var(--fullscreen-safe-bottom) );',
    );
    expect(globalCss).toContain(
      '--floating-corner-top-base: 12px;',
    );
    expect(globalCss).toContain(
      '--floating-corner-top-safe-padding: 8px;',
    );
    expect(globalCss).toContain(
      '--floating-corner-left-base: 16px;',
    );
    expect(globalCss).toContain(
      '--floating-corner-left-safe-padding: 16px;',
    );
    expect(globalCss).toContain(
      '--floating-corner-right-base: 16px;',
    );
    expect(globalCss).toContain(
      '--floating-corner-right-safe-padding: 16px;',
    );
    expect(globalCss).toContain(
      '--floating-corner-top-offset: max( var(--floating-corner-top-base), calc(var(--safe-top) + var(--floating-corner-top-safe-padding)) );',
    );
    expect(globalCss).toContain(
      '--floating-corner-left-offset: max( var(--floating-corner-left-base), calc(var(--safe-left) + var(--floating-corner-left-safe-padding)) );',
    );
    expect(globalCss).toContain(
      '--floating-corner-right-offset: max( var(--floating-corner-right-base), calc(var(--safe-right) + var(--floating-corner-right-safe-padding)) );',
    );
    expect(globalCss).toContain('html.is-capacitor,');
    expect(globalCss).toContain('html.is-chrome-android {');
    expect(globalCss).toContain('--app-safe-area-top-fallback: 16px;');
    expect(appShellCss).toContain('padding-top: var(--safe-top);');
    expect(appShellCss).toContain('padding-bottom: var(--safe-bottom);');
    expect(navBarCss).toContain('flex-shrink: 0;');
    expect(gameBottomNavCss).toContain('height: calc(var(--nav-bar-height, 60px) + var(--safe-bottom));');
    expect(gameBottomNavCss).toContain('inset: 0 0 var(--safe-bottom) 0;');
    expect(minigameHostCss).toContain('--floating-corner-top-base: 12px;');
    expect(minigameHostCss).toContain('--floating-corner-right-base: 14px;');
    expect(minigameHostCss).toContain('top: var(--floating-corner-top-offset);');
    expect(minigameHostCss).toContain('right: var(--floating-corner-right-offset);');
    expect(minigameHostCss).toContain('calc(var(--fullscreen-safe-top) + 24px)');
    expect(minigameRulesCss).toContain('calc(var(--fullscreen-safe-top) + 16px)');
    expect(quickTapCss).toContain('calc(var(--fullscreen-safe-top) + 16px)');
    expect(pressurePlankCss).toContain('padding: var(--fullscreen-safe-top) var(--fullscreen-safe-right) var(--fullscreen-safe-bottom) var(--fullscreen-safe-left);');
    expect(bullseyeCss).toContain('calc(var(--fullscreen-safe-top) + 16px)');
    expect(travelingDotsCss).toContain('calc(var(--fullscreen-safe-top) + 12px)');
    expect(spectatorCss).toContain('calc(var(--fullscreen-safe-top) + 52px)');
    expect(wildcardWesternCss).toContain('padding: var(--fullscreen-safe-top) var(--fullscreen-safe-right) var(--fullscreen-safe-bottom) var(--fullscreen-safe-left);');
    expect(timingBarCss).toContain('calc(var(--fullscreen-safe-top) + 16px)');
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
