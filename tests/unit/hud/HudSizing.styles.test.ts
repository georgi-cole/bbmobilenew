import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('HUD sizing styles', () => {
  it('slightly enlarges the FAB and bottom nav icon layout', () => {
    const dockCss = readFileSync(
      resolve(process.cwd(), 'src/components/GameControlDock/GameControlDock.css'),
      'utf8',
    );
    const navCss = readFileSync(
      resolve(process.cwd(), 'src/components/GameBottomNav/GameBottomNav.css'),
      'utf8',
    );
    const layoutNavCss = readFileSync(
      resolve(process.cwd(), 'src/components/layout/NavBar.css'),
      'utf8',
    );
    const houseguestGridTsx = readFileSync(
      resolve(process.cwd(), 'src/components/HouseguestGrid/HouseguestGrid.tsx'),
      'utf8',
    );
    const gameScreenCss = readFileSync(
      resolve(process.cwd(), 'src/screens/GameScreen/GameScreen.css'),
      'utf8',
    );
    const navItemsRule = /\.game-bottom-nav__items\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?\}/;
    const navGlyphRule = /\.game-bottom-nav__glyph\s*\{[\s\S]*?width:\s*22px;[\s\S]*?height:\s*22px;[\s\S]*?\}/;

    expect(dockCss).toContain('width: min(80vw, 340px);');
    expect(dockCss).toContain('bottom: calc(var(--nav-bar-height) + 6px + env(safe-area-inset-bottom, 0px));');
    expect(navCss).toContain('height: calc(var(--nav-bar-height, 62px) + env(safe-area-inset-bottom, 0px));');
    expect(navCss).toMatch(navItemsRule);
    expect(navCss).toContain('column-gap: 6px;');
    expect(navCss).toContain('padding: 2px 2.75% 0;');
    expect(navCss).toMatch(navGlyphRule);
    expect(navCss).toContain('width: 100%;');
    expect(navCss).toContain('min-width: 0;');
    expect(navCss).toContain('min-height: 44px;');
    expect(navCss).toContain('gap: 2px;');
    expect(navCss).toContain('padding: 5px 6px 4px;');
    expect(navCss).toContain('background: rgba(255, 255, 255, 0.06);');
    expect(navCss).toContain('border: 1px solid rgba(255, 255, 255, 0.06);');
    expect(navCss).toContain('border-radius: 9px;');
    expect(navCss).toContain('backdrop-filter: blur(8px);');
    expect(navCss).toContain('inset 0 1px 0 rgba(255, 255, 255, 0.08)');
    expect(navCss).toContain('0 0 8px rgba(0, 0, 0, 0.15)');
    expect(navCss).toContain('filter: brightness(1.04);');
    expect(layoutNavCss).toContain('--nav-bar-height: 62px;');
    expect(houseguestGridTsx).toContain('const GRID_VERTICAL_MARGIN = 6');
    expect(gameScreenCss).toContain('gap: 8px;');
    expect(gameScreenCss).toContain('padding: 12px 12px calc(var(--nav-bar-height) + 12px);');
  });

  it('keeps top chips content-sized so longer labels have room to fit', () => {
    const chipCss = readFileSync(
      resolve(process.cwd(), 'src/components/GameTopChip/GameTopChip.css'),
      'utf8',
    );
    const houseguestGridCss = readFileSync(
      resolve(process.cwd(), 'src/components/HouseguestGrid/HouseguestGrid.module.css'),
      'utf8',
    );

    expect(chipCss).toContain('height: 28px;');
    expect(chipCss).toContain('width: auto;');
    expect(chipCss).toContain('max-width: 100%;');
    expect(chipCss).toContain('min-width: var(--game-top-chip-min-width, 68px);');
    expect(chipCss).toContain('border-radius: 999px;');
    expect(chipCss).toContain('padding: 0 var(--game-top-chip-inline-padding, 13px);');
    expect(chipCss).toContain('font-size: 0.68rem;');
    expect(houseguestGridCss).toContain('padding: 4px 8px 6px;');
    expect(houseguestGridCss).toContain('margin-bottom: 10px;');
  });
});
