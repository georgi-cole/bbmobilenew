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
    expect(appShellTsx).toContain('<SafeGameViewport>');

    expect(safeViewportCss).toContain('.safe-game-viewport { position: fixed; inset: 0;');
    expect(safeViewportCss).toContain('height: 100dvh;');
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

  it('keeps home hub and minigame rules inside their safe viewport parents', () => {
    const homeHubCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/HomeHub/HomeHub.css'), 'utf8'),
    );
    const minigameRulesCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/MinigameRules/MinigameRules.css'), 'utf8'),
    );

    expect(homeHubCss).toContain('.homehub-shell { position: relative; width: 100%; height: 100%;');
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
