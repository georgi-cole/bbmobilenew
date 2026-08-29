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
    const tvZoneCss = readFileSync(
      resolve(process.cwd(), 'src/components/ui/TvZone.css'),
      'utf8',
    );
    const navItemsRule = /\.game-bottom-nav__items\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*0;[\s\S]*?right:\s*0;[\s\S]*?bottom:\s*auto;[\s\S]*?left:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*var\(--game-bottom-nav-content-height\);[\s\S]*?\}/;
    const navGlyphRule = /\.game-bottom-nav__glyph\s*\{[\s\S]*?width:\s*var\(--game-nav-glyph-size, 22px\);[\s\S]*?height:\s*var\(--game-nav-glyph-size, 22px\);[\s\S]*?\}/;
    const tvHeadRule = /\.tv-zone__head\s*\{[\s\S]*?gap:\s*3px;[\s\S]*?padding:\s*3px 7px;[\s\S]*?\}/;
    const tvHeadChipRule = /\.tv-zone__head-chip\s*\{[\s\S]*?min-width:\s*auto;[\s\S]*?height:\s*21px;[\s\S]*?padding:\s*0 7px;[\s\S]*?\}/;

    expect(dockCss).toContain('width: min(calc(106.0606% - 25.455px), 483.636px);');
    expect(dockCss).toContain('var(--game-action-dock-gap, 8px)');
    expect(navCss).toContain('height: calc(var(--game-bottom-nav-content-height) + var(--safe-bottom));');
    expect(navCss).toContain('overflow: visible;');
    expect(navCss).toContain('.game-bottom-nav.nav-bar::before {');
    expect(navCss).toContain('clip-path: inset(0 round var(--game-bottom-nav-panel-radius));');
    expect(navCss).toContain('background: linear-gradient(180deg, rgba(17, 24, 37, 0.96), rgba(12, 18, 31, 0.98));');
    expect(navCss).toContain('border: 1px solid rgba(255, 255, 255, 0.06);');
    expect(navCss).toContain('mix-blend-mode: soft-light;');
    expect(navCss).toContain('opacity: 0.16;');
    expect(navCss).toMatch(navItemsRule);
    expect(navCss).toContain('column-gap: 7px;');
    expect(navCss).toContain('padding: 1px 2.25% 3px;');
    expect(navCss).toContain('background: transparent;');
    expect(navCss).toMatch(navGlyphRule);
    expect(navCss).toContain('width: 100%;');
    expect(navCss).toContain('min-width: 0;');
    expect(navCss).toContain('min-height: 44px;');
    expect(navCss).toContain('gap: 2px;');
    expect(navCss).toContain('padding: 4px 6px 3px;');
    expect(navCss).toContain('background: linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.05));');
    expect(navCss).toContain('border: 1px solid rgba(255, 255, 255, 0.055);');
    expect(navCss).toContain('border-radius: 8px;');
    expect(navCss).toContain('backdrop-filter: blur(6px);');
    expect(navCss).toContain('box-shadow: 0 4px 10px rgba(3, 8, 20, 0.18);');
    expect(navCss).toContain('filter: brightness(1.02);');
    expect(navCss).not.toContain('.game-bottom-nav__segment');
    expect(layoutNavCss).toContain('--nav-bar-height: 60px;');
    expect(houseguestGridTsx).toContain('const GRID_VERTICAL_MARGIN = 4');
    expect(gameScreenCss).toContain('gap: var(--game-layout-rhythm, 8px);');
    expect(gameScreenCss).toContain('padding: 4px 12px 6px;');
    expect(tvZoneCss).toContain('.tv-zone__head-chip {');
    expect(tvZoneCss).toMatch(tvHeadRule);
    expect(tvZoneCss).toMatch(tvHeadChipRule);
  });

  it('keeps top chips content-sized so longer labels have room to fit', () => {
    const chipCss = readFileSync(
      resolve(process.cwd(), 'src/components/GameTopChip/GameTopChip.css'),
      'utf8',
    );
    const tvZoneCss = readFileSync(
      resolve(process.cwd(), 'src/components/ui/TvZone.css'),
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
    expect(tvZoneCss).toContain('gap: 3px;');
    expect(tvZoneCss).toContain('padding: 3px 7px;');
    expect(tvZoneCss).toContain('.tv-zone__head-chip {');
    expect(tvZoneCss).toContain('min-width: auto;');
    expect(tvZoneCss).toContain('height: 21px;');
    expect(tvZoneCss).toContain('padding: 0 7px;');
    expect(tvZoneCss).toContain('font-size: 0.56rem;');
    expect(houseguestGridCss).toContain('padding: 0;');
    expect(houseguestGridCss).toContain('margin: 0 0 var(--game-layout-rhythm, 8px);');
  });
});
