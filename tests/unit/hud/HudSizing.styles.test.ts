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
    const navItemsRule = /\.game-bottom-nav__items\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?\}/;
    const navGlyphRule = /\.game-bottom-nav__glyph\s*\{[\s\S]*?width:\s*22px;[\s\S]*?height:\s*22px;[\s\S]*?\}/;
    const tvHeadRule = /\.tv-zone__head\s*\{[\s\S]*?gap:\s*5px;[\s\S]*?padding:\s*6px 10px;[\s\S]*?\}/;
    const tvHeadChipRule = /\.tv-zone__head-chip\s*\{[\s\S]*?height:\s*30px;[\s\S]*?min-width:\s*30px;[\s\S]*?padding:\s*0 11px;[\s\S]*?\}/;

    expect(dockCss).toContain('width: min(80vw, 340px);');
    expect(dockCss).toContain('bottom: calc(var(--nav-bar-height) + 3px + env(safe-area-inset-bottom, 0px));');
    expect(navCss).toContain('height: calc(var(--nav-bar-height, 60px) + env(safe-area-inset-bottom, 0px));');
    expect(navCss).toContain('overflow: hidden;');
    expect(navCss).toContain('border-radius: 18px 18px 28px 28px / 12px 12px 24px 24px;');
    expect(navCss).toContain('clip-path: inset(0 round 18px 18px 28px 28px / 12px 12px 24px 24px);');
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
    expect(navCss).toContain('min-height: 42px;');
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
    expect(gameScreenCss).toContain('gap: 6px;');
    expect(gameScreenCss).toContain('padding: 12px 12px calc(var(--nav-bar-height) + 10px);');
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
    expect(tvZoneCss).toContain('gap: 5px;');
    expect(tvZoneCss).toContain('padding: 7px 11px;');
    expect(tvZoneCss).toContain('.tv-zone__head-chip {');
    expect(tvZoneCss).toContain('min-width: auto;');
    expect(tvZoneCss).toContain('height: 22px;');
    expect(tvZoneCss).toContain('padding: 0 10px;');
    expect(tvZoneCss).toContain('font-size: 0.62rem;');
    expect(houseguestGridCss).toContain('padding: 4px 8px 6px;');
    expect(houseguestGridCss).toContain('margin-bottom: 10px;');
  });
});
