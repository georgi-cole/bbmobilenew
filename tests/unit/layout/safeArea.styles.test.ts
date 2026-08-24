import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function normalizeCss(css: string) {
  return css.replace(/\s+/g, ' ').trim()
}

describe('safe-area layout styles', () => {
  it('restores the pre-1044 AppShell viewport ownership model', () => {
    const globalCss = normalizeCss(readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8'))
    const appShellTsx = readFileSync(
      resolve(process.cwd(), 'src/components/layout/AppShell.tsx'),
      'utf8'
    )
    const appShellCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/layout/AppShell.css'), 'utf8')
    )

    expect(globalCss).toContain('--safe-area-inset-top: env(safe-area-inset-top, 0px);')
    expect(globalCss).toContain('--safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);')
    expect(globalCss).toContain('--safe-top: var(--safe-area-inset-top);')
    expect(globalCss).toContain('--safe-bottom: var(--safe-area-inset-bottom);')
    expect(globalCss).not.toContain('html.is-chrome-android {')
    expect(existsSync(resolve(process.cwd(), 'src/components/layout/SafeGameViewport.tsx'))).toBe(
      false
    )
    expect(existsSync(resolve(process.cwd(), 'src/components/layout/SafeGameViewport.css'))).toBe(
      false
    )
    expect(appShellTsx).not.toContain('SafeGameViewport')
    expect(appShellCss).toContain('height: 100dvh;')
    expect(appShellCss).toContain('max-width: var(--app-shell-max-width, 480px);')
    expect(appShellCss).toContain('margin: 0 auto;')
    expect(appShellCss).toContain('min-height: 0;')
    expect(appShellCss).toContain('padding-top: var(--app-safe-area-top);')
    expect(appShellCss).toContain('padding-right: var(--safe-right);')
    expect(appShellCss).toContain('padding-bottom: 0;')
    expect(appShellCss).toContain('padding-left: var(--safe-left);')
    expect(globalCss).toContain('env(safe-area-inset-top, 0px)')
    expect(globalCss).toContain(
      '--app-safe-area-top: max( var(--app-safe-area-top-fallback), var(--safe-top), env(safe-area-inset-top, 0px) );'
    )
  })

  it('lets bottom nav and dock stay parent-relative without raw child env() padding', () => {
    const bottomNavCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/GameBottomNav/GameBottomNav.css'), 'utf8')
    )
    const dockCss = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/GameControlDock/GameControlDock.css'),
        'utf8'
      )
    )
    const gameScreenCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/GameScreen/GameScreen.css'), 'utf8')
    )

    expect(bottomNavCss).toContain(
      'height: calc(var(--game-bottom-nav-content-height) + var(--safe-bottom));'
    )
    expect(bottomNavCss).toContain('padding-bottom: var(--safe-bottom);')
    expect(bottomNavCss).not.toContain('env(safe-area-inset-bottom')
    expect(dockCss).toContain('.game-control-dock { position: absolute;')
    expect(dockCss).toContain('bottom: var(--game-action-dock-gap, 8px);')
    expect(dockCss).not.toContain('position: fixed;')
    expect(dockCss).not.toContain('env(safe-area-inset-bottom')
    expect(gameScreenCss).toContain('.game-screen:has(.game-control-dock)')
    expect(gameScreenCss).toContain('html.is-capacitor-ios .game-screen { padding-top: 0; }')
    expect(gameScreenCss).toContain(
      '--game-screen-floating-dock-clearance: clamp(56px, 16vw, 76px);'
    )
  })

  it('keeps gameplay painted and roster positions stable', () => {
    const gameScreenCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/GameScreen/GameScreen.css'), 'utf8')
    )
    const gameScreenTsx = readFileSync(
      resolve(process.cwd(), 'src/screens/GameScreen/GameScreen.tsx'),
      'utf8'
    )
    const houseguestGridCss = normalizeCss(
      readFileSync(
        resolve(process.cwd(), 'src/components/HouseguestGrid/HouseguestGrid.module.css'),
        'utf8'
      )
    )
    const ceremonyOverlayTsx = readFileSync(
      resolve(process.cwd(), 'src/components/CeremonyOverlay/CeremonyOverlay.tsx'),
      'utf8'
    )
    const tvLogCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/components/TVLog/TVLog.css'), 'utf8')
    )

    expect(gameScreenCss).toContain(
      "body:has(.game-screen-shell) .app-shell { background-color: var(--color-bg); background-image: url('../../assets/bb-gameplay-bg.svg');"
    )
    expect(gameScreenCss).not.toContain('.safe-game-viewport')
    expect(houseguestGridCss).toContain('grid-auto-rows: max-content;')
    expect(houseguestGridCss).toContain('align-content: start;')
    expect(houseguestGridCss).toContain(
      'grid-template-columns: repeat(4, minmax(0, var(--game-avatar-tile-size, 1fr)));'
    )
    expect(houseguestGridCss).toContain('gap: var(--game-roster-gap, 5px);')
    expect(houseguestGridCss).toContain('width: var(--game-avatar-tile-size, 100%);')
    expect(houseguestGridCss).toContain('height: var(--game-roster-board-height, auto);')
    expect(houseguestGridCss).toContain('overflow: visible;')
    expect(houseguestGridCss).not.toContain('.scrollRoster .grid { overflow-y: auto;')
    expect(houseguestGridCss).toContain(".container[data-header-mode='persistent'] .headerRow")
    expect(houseguestGridCss).toContain(".container[data-header-mode='tv-chip'] .headerRow")
    expect(gameScreenTsx).toContain('occupancyChip={rosterOccupancyChip}')
    expect(houseguestGridCss).not.toContain('survivorTileSettle')
    expect(gameScreenTsx).toContain('useResponsiveGameLayout')
    expect(gameScreenTsx).toContain('freezeLayout: flowCoordination.activeFlow !== null')
    expect(gameScreenTsx).toContain('layoutSignal={responsiveGameLayout.revision}')
    expect(ceremonyOverlayTsx).toContain('layoutSignal?: string | number')
    expect(tvLogCss).toContain('overflow-y: auto;')
    expect(tvLogCss).toContain('@media (max-width: 480px) and (max-height: 900px)')
    expect(tvLogCss).toContain('max-height: var(--tv-log-item-h);')
    expect(tvLogCss).not.toMatch(/\.tv-log\s*\{[^}]*display:\s*none/)
  })

  it('restores HomeHub-owned full-height decorative background with safe controls', () => {
    const homeHubTsx = readFileSync(
      resolve(process.cwd(), 'src/screens/HomeHub/HomeHub.tsx'),
      'utf8'
    )
    const homeHubCss = normalizeCss(
      readFileSync(resolve(process.cwd(), 'src/screens/HomeHub/HomeHub.css'), 'utf8')
    )
    const frameIndex = homeHubTsx.indexOf('className="homehub-frame"')
    const bgIndex = homeHubTsx.indexOf('className="homehub-intro-bg"')
    const assetLayerIndex = homeHubTsx.indexOf('<HomeHubAssetLayer')

    expect(homeHubTsx).not.toContain("body.classList.add('homehub-full-bleed-active')")
    expect(homeHubTsx).toContain('className="homehub-intro-bg"')
    expect(homeHubTsx).toContain('className="homehub-remote-overlay"')
    expect(bgIndex).toBeGreaterThan(frameIndex)
    expect(assetLayerIndex).toBeGreaterThan(bgIndex)
    expect(homeHubCss).toContain(
      '.homehub-shell { position: relative; min-height: 100vh; min-height: 100dvh;'
    )
    expect(homeHubCss).toContain(
      'min-height: calc(100% + var(--app-safe-area-top, 0px) + var(--safe-bottom, 0px));'
    )
    expect(homeHubCss).toContain('margin-top: calc(-1 * var(--app-safe-area-top, 0px));')
    expect(homeHubCss).toContain('margin-bottom: calc(-1 * var(--safe-bottom, 0px));')
    expect(homeHubCss).toContain(
      '.homehub-frame { position: relative; width: min(100vw, 480px); height: 100vh; height: 100dvh;'
    )
    expect(homeHubCss).toContain(
      'padding-top: var(--app-safe-area-top, env(safe-area-inset-top, 0px));'
    )
    expect(homeHubCss).toContain('padding-bottom: var(--safe-bottom);')
    expect(homeHubCss).toContain('.homehub-intro-bg { position: absolute; inset: 0;')
    expect(homeHubCss).not.toMatch(/\.homehub-(?:shell|frame)\s*\{[^}]*overflow-y:\s*auto/)
  })

  it('uses immersive gameplay status chrome with CSS-owned safe-area fallback', () => {
    const capacitorConfigTs = readFileSync(resolve(process.cwd(), 'capacitor.config.ts'), 'utf8')
    const useGameModeTs = readFileSync(resolve(process.cwd(), 'src/hooks/useGameMode.ts'), 'utf8')
    const viewportMetaTs = readFileSync(
      resolve(process.cwd(), 'src/components/layout/viewportMeta.ts'),
      'utf8'
    )

    expect(useGameModeTs).toContain('SystemBars.hide({ bar: SystemBarType.StatusBar })')
    expect(useGameModeTs).toContain("Capacitor.getPlatform() === 'android'")
    expect(useGameModeTs).toContain('measured CSS safe area remains the fallback')
    expect(useGameModeTs).not.toContain('setOverlaysWebView')
    expect(capacitorConfigTs).toContain("contentInset: 'never'")
    expect(capacitorConfigTs).toContain('SystemBars:')
    expect(capacitorConfigTs).toContain("insetsHandling: 'css'")
    expect(capacitorConfigTs).toContain('hidden: false')
    expect(viewportMetaTs).toContain('viewport-fit=cover')
  })

  it('guards cold direct /game navigation instead of rendering inactive controls', () => {
    const routesTsx = readFileSync(resolve(process.cwd(), 'src/routes.tsx'), 'utf8')
    const gameRouteTsx = readFileSync(resolve(process.cwd(), 'src/routes/GameRoute.tsx'), 'utf8')
    const navBarTsx = readFileSync(
      resolve(process.cwd(), 'src/components/layout/NavBar.tsx'),
      'utf8'
    )
    const gameSliceTs = readFileSync(resolve(process.cwd(), 'src/store/gameSlice.ts'), 'utf8')

    expect(routesTsx).toContain("const GameRoute = lazy(() => import('./routes/GameRoute'))")
    expect(routesTsx).toContain("{ path: 'game', element: load(<GameRoute />) }")
    expect(gameRouteTsx).toContain('export default function GameRoute()')
    expect(gameRouteTsx).toContain("game.status === 'active'")
    expect(gameRouteTsx).toContain('<Navigate to="/" replace />')
    expect(navBarTsx).toContain("s.game.status === 'active'")
    expect(gameSliceTs).toContain("status: 'active' as const")
  })
})
