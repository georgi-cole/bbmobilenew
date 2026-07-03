import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim();
}

describe('safe-area layout styles', () => {
  it('defines global safe-area tokens and a single safe game viewport contract', () => {
    const globalCss = normalizeCss(readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8'));
    const safeViewportTsx = readFileSync(
      resolve(process.cwd(), 'src/components/layout/SafeGameViewport.tsx'),
      'utf8',
    );
    const safeViewportCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/layout/SafeGameViewport.css'), 'utf8'),
    );
    const appShellTsx = readFileSync(
      resolve(process.cwd(), 'src/components/layout/AppShell.tsx'),
      'utf8',
    );
    const appShellCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/layout/AppShell.css'), 'utf8'),
    );

    expect(globalCss).toContain('--safe-top: env(safe-area-inset-top, 0px);');
    expect(globalCss).toContain('--safe-right: env(safe-area-inset-right, 0px);');
    expect(globalCss).toContain('--safe-bottom: env(safe-area-inset-bottom, 0px);');
    expect(globalCss).toContain('--safe-left: env(safe-area-inset-left, 0px);');
    expect(safeViewportTsx).toContain('export default function SafeGameViewport');
    expect(safeViewportTsx).toContain('safe-game-viewport__bleed');
    expect(appShellTsx).toContain('<SafeGameViewport>');

    expect(safeViewportCss).toContain('.safe-game-viewport { position: fixed; inset: 0;');
    expect(safeViewportCss).toContain('height: 100dvh;');
    expect(safeViewportCss).toContain('.safe-game-viewport__bleed { position: fixed; inset: 0;');
    expect(safeViewportCss).toContain('body.homehub-full-bleed-active .safe-game-viewport__bleed');
    expect(safeViewportCss).toContain('top: var(--safe-top);');
    expect(safeViewportCss).toContain('right: var(--safe-right);');
    expect(safeViewportCss).toContain('bottom: var(--safe-bottom);');
    expect(safeViewportCss).toContain('left: var(--safe-left);');
    expect(safeViewportCss).toContain('.safe-game-viewport--debug::before');
    expect(safeViewportCss).toContain('.safe-game-viewport--debug .safe-game-viewport__content::after');

    expect(appShellCss).toContain('height: 100%;');
    expect(appShellCss).toContain('min-height: 0;');
    expect(appShellCss).not.toContain('padding-top: var(--app-safe-area-top);');
    expect(appShellCss).not.toContain('padding-bottom: var(--safe-bottom);');
  });

  it('does not double-count the bottom safe area inside the app shell', () => {
    const bottomNavCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/GameBottomNav/GameBottomNav.css'), 'utf8'),
    );
    const dockCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/GameControlDock/GameControlDock.css'), 'utf8'),
    );
    const gameScreenCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/GameScreen/GameScreen.css'), 'utf8'),
    );

    expect(bottomNavCss).toContain('height: var(--nav-bar-height, 60px);');
    expect(bottomNavCss).not.toContain('height: calc(var(--nav-bar-height, 60px) + var(--safe-bottom));');
    expect(bottomNavCss).not.toContain('env(safe-area-inset-bottom');

    expect(dockCss).toContain('.game-control-dock { position: absolute;');
    expect(dockCss).toContain('bottom: 8px;');
    expect(dockCss).not.toContain('position: fixed; bottom: calc(var(--nav-bar-height)');
    expect(dockCss).not.toContain('env(safe-area-inset-bottom');

    expect(gameScreenCss).toContain('height: 100%;');
    expect(gameScreenCss).toContain('overflow: hidden;');
    expect(gameScreenCss).toContain('.game-screen:has(.game-control-dock)');
    expect(gameScreenCss).not.toContain('padding: 12px 12px calc(var(--nav-bar-height) + 10px);');
  });

  it('keeps gameplay safe bands painted while TV and log keep their own space', () => {
    const gameScreenCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/GameScreen/GameScreen.css'), 'utf8'),
    );
    const tvZoneCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/ui/TvZone.css'), 'utf8'),
    );
    const tvLogTsx = readFileSync(resolve(process.cwd(), 'src/components/TVLog/TVLog.tsx'), 'utf8');
    const tvLogCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/TVLog/TVLog.css'), 'utf8'),
    );
    const houseguestGridTsx = readFileSync(
      resolve(process.cwd(), 'src/components/HouseguestGrid/HouseguestGrid.tsx'),
      'utf8',
    );
    const houseguestGridCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/HouseguestGrid/HouseguestGrid.module.css'), 'utf8'),
    );

    expect(gameScreenCss).toContain('--game-screen-tv-min-height: clamp(238px, 30svh, 312px);');
    expect(gameScreenCss).toContain('--game-screen-tv-viewport-min-height: clamp(144px, 18svh, 192px);');
    expect(gameScreenCss).toContain('.game-screen > .tv-zone, .game-screen--compact-roster-balance > .tv-zone { flex: 0 0 auto; min-height: var(--game-screen-tv-min-height); --tv-zone-viewport-min-height: var(--game-screen-tv-viewport-min-height); }');
    expect(gameScreenCss).toContain("body:has(.game-screen-shell) .safe-game-viewport { background-color: var(--color-bg); background-image: url('/assets/bb-gameplay-bg.svg');");
    expect(gameScreenCss).not.toContain('.game-screen--compact-roster-balance > .tv-zone { flex: 1 1 auto; min-height: 0; }');

    expect(tvZoneCss).toContain('.tv-zone { display: flex; flex: 0 0 auto; flex-direction: column; min-height: var(--tv-zone-min-height, 238px);');
    expect(tvZoneCss).toContain('flex: 1 0 auto; min-height: var(--tv-zone-viewport-min-height, 192px); display: flex;');
    expect(tvZoneCss).toContain('.tv-zone__bezel { display: flex; flex: 1 1 auto; align-items: stretch; min-height: 0;');
    expect(tvZoneCss).not.toContain('.tv-zone { flex: 1 1 auto;');

    expect(tvLogTsx).toContain('const MAX_ADAPTIVE_VISIBLE_ROWS = 3;');
    expect(tvLogTsx).toContain('entries.length <= 1');
    expect(tvLogTsx).toContain('visible.length === 0');
    expect(tvLogTsx).toContain("'--tv-log-max-vis': effectiveMaxVisible");
    expect(tvLogCss).toContain('.tv-log { --tv-log-item-h: 36px; --tv-log-max-vis: 3; flex: 0 0 auto;');
    expect(tvLogCss).toContain('min-height: var(--tv-log-item-h);');
    expect(tvLogCss).toContain('max-height: clamp(var(--tv-log-item-h), 10svh, calc(var(--tv-log-item-h) * var(--tv-log-max-vis)));');
    expect(tvLogCss).toContain('overflow-y: auto;');
    expect(tvLogCss).not.toContain('display: none;');

    expect(houseguestGridTsx).toContain('const headerSignal = occupancyLabel ?? `${renderedHouseguests.length}`');
    expect(houseguestGridTsx).toContain('key={headerSignal}');
    expect(houseguestGridTsx).not.toContain('setHeaderVisible');
    expect(houseguestGridCss).toContain('.headerRow { position: absolute; top: 4px; left: 8px;');
    expect(houseguestGridCss).toContain('animation: houseguestHeaderFlash 2200ms ease forwards;');
    expect(houseguestGridCss).toContain('.grid { list-style: none; margin: 0; padding: 0; display: grid; flex: 1 1 auto; min-height: 0;');
    expect(houseguestGridCss).toContain('overflow-y: auto;');
  });

  it('keeps home hub controls safe-contained while decorative art is owned by the physical viewport', () => {
    const safeViewportCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/layout/SafeGameViewport.css'), 'utf8'),
    );
    const homeHubTsx = readFileSync(resolve(process.cwd(), 'src/screens/HomeHub/HomeHub.tsx'), 'utf8');
    const homeHubCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/HomeHub/HomeHub.css'), 'utf8'),
    );
    const minigameRulesCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/MinigameRules/MinigameRules.css'), 'utf8'),
    );
    const frameIndex = homeHubTsx.indexOf('className="homehub-frame"');
    const assetLayerIndex = homeHubTsx.indexOf('<HomeHubAssetLayer');

    expect(homeHubTsx).toContain("body.classList.add('homehub-full-bleed-active')");
    expect(homeHubTsx).toContain("--homehub-full-bleed-bg");
    expect(homeHubTsx).toContain("--homehub-full-bleed-overlay-opacity");
    expect(homeHubTsx).not.toContain('className="homehub-intro-bg"');
    expect(homeHubTsx).not.toContain('className="homehub-remote-overlay"');
    expect(frameIndex).toBeGreaterThan(-1);
    expect(assetLayerIndex).toBeGreaterThan(frameIndex);

    expect(safeViewportCss).toContain('body.homehub-full-bleed-active { background-color: var(--color-bg);');
    expect(safeViewportCss).toContain('background-image: var(--homehub-full-bleed-bg, none);');
    expect(safeViewportCss).toContain('.safe-game-viewport__bleed { position: fixed; inset: 0;');
    expect(safeViewportCss).toContain('opacity: var(--homehub-full-bleed-overlay-opacity, 0);');

    expect(homeHubCss).toContain('.homehub-shell { position: relative; width: 100%; height: 100%;');
    expect(homeHubCss).toContain('overflow: hidden;');
    expect(homeHubCss).toContain('.homehub-frame { position: relative; z-index: 2; width: 100%;');
    expect(homeHubCss).toContain('.home-hub__buttons { display: flex; flex-direction: column;');
    expect(homeHubCss).toContain('overflow-y: auto;');
    expect(homeHubCss).not.toContain('.homehub-intro-bg');
    expect(homeHubCss).not.toContain('.homehub-remote-overlay');
    expect(homeHubCss).not.toMatch(/\.homehub-(?:shell|frame)\s*\{[^}]*overflow-y:\s*auto/);
    expect(homeHubCss).not.toContain('min-height: 100vh');
    expect(homeHubCss).not.toContain('min-height: 100dvh');
    expect(homeHubCss).not.toContain('margin-top: calc(-1 * var(--app-safe-area-top');
    expect(homeHubCss).not.toContain('env(safe-area-inset');

    expect(minigameRulesCss).toContain('.minigame-rules-overlay { position: absolute; inset: 0; height: 100%;');
    expect(minigameRulesCss).toContain('overflow: hidden;');
    expect(minigameRulesCss).toContain('.minigame-rules-modal { position: relative; display: flex; flex-direction: column;');
    expect(minigameRulesCss).toContain('.minigame-rules-list { margin: 0 0 8px; padding-left: 20px; line-height: 1.6; flex: 1 1 auto;');
    expect(minigameRulesCss).not.toContain('position: fixed;');
    expect(minigameRulesCss).not.toContain('100dvh');
  });

  it('keeps native status bar policy aligned with CSS-owned safe areas', () => {
    const useGameModeTs = readFileSync(resolve(process.cwd(), 'src/hooks/useGameMode.ts'), 'utf8');
    const viewportMetaTs = readFileSync(
      resolve(process.cwd(), 'src/components/layout/viewportMeta.ts'),
      'utf8',
    );

    expect(useGameModeTs).toContain('SafeGameViewport remains the only safe-area layout owner');
    expect(useGameModeTs).toContain('setOverlaysWebView?.({ overlay: true })');
    expect(useGameModeTs).not.toContain('setOverlaysWebView?.({ overlay: false })');
    expect(viewportMetaTs).toContain('viewport-fit=cover');
  });

  it('keeps minigames and old fullscreen game roots inside the safe viewport', () => {
    const safeViewportCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/layout/SafeGameViewport.css'), 'utf8'),
    );
    const minigameHostCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/MinigameHost/MinigameHost.css'), 'utf8'),
    );
    const gameScreenCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/GameScreen/GameScreen.css'), 'utf8'),
    );

    expect(safeViewportCss).toContain('.minigame-host, .qtr, .qtr-canvas, .pp, .bbl, .td, .snake-root, .spectator-overlay, .pf-overlay, .day-start-shock');
    expect(safeViewportCss).toContain('position: absolute !important;');
    expect(safeViewportCss).toContain('--app-safe-area-top: 0px;');

    expect(minigameHostCss).toContain('.minigame-host { position: absolute; inset: 0;');
    expect(minigameHostCss).toContain('height: 100%;');
    expect(minigameHostCss).toContain('max-height: 100%;');
    expect(minigameHostCss).toContain('overflow-y: auto;');
    expect(minigameHostCss).not.toContain('position: fixed;');
    expect(minigameHostCss).not.toContain('100vh');
    expect(minigameHostCss).not.toContain('100dvh');

    expect(gameScreenCss).toContain('position: relative;');
    expect(gameScreenCss).toContain('height: 100%;');
    expect(gameScreenCss).not.toContain('100vh');
    expect(gameScreenCss).not.toContain('100dvh');
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
