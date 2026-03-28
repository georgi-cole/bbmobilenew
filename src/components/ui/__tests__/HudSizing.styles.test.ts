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

    expect(dockCss).toContain('width: min(80vw, 340px);');
    expect(navCss).toContain('height: calc(var(--nav-bar-height, 62px) + env(safe-area-inset-bottom, 0px));');
    expect(navCss).toContain('width: 22px;');
    expect(navCss).toContain('height: 22px;');
    expect(layoutNavCss).toContain('--nav-bar-height: 62px;');
  });

  it('keeps top chips content-sized so longer labels have room to fit', () => {
    const chipCss = readFileSync(
      resolve(process.cwd(), 'src/components/GameTopChip/GameTopChip.css'),
      'utf8',
    );

    expect(chipCss).toContain('height: 28px;');
    expect(chipCss).toContain('width: fit-content;');
    expect(chipCss).toContain('max-width: 100%;');
    expect(chipCss).toContain('padding: 0 13px;');
  });
});
