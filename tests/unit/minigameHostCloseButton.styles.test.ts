import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRuleBody(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
  expect(match).not.toBeNull();
  return match![1];
}

function readZIndex(body: string): number {
  const match = body.match(/z-index:\s*(\d+)/);
  expect(match).not.toBeNull();
  return Number(match![1]);
}

describe('MinigameHost utility dock layering and touch target', () => {
  it('stacks the dock above full-viewport minigame roots', () => {
    const dockCss = readFileSync(
      resolve(process.cwd(), 'src/components/MinigameUtilityDock/MinigameUtilityDock.css'),
      'utf8',
    );
    const bullseyeCss = readFileSync(
      resolve(process.cwd(), 'src/components/BullseyeBlitz/BullseyeBlitz.css'),
      'utf8',
    );

    const dockZ = readZIndex(readRuleBody(dockCss, '.minigame-utility-dock'));
    const bullseyeRootZ = readZIndex(readRuleBody(bullseyeCss, '.bbl'));

    expect(dockZ).toBeGreaterThan(bullseyeRootZ);
  });

  it('keeps the edge orb at a mobile-safe 44 by 44 pixel target', () => {
    const dockCss = readFileSync(
      resolve(process.cwd(), 'src/components/MinigameUtilityDock/MinigameUtilityDock.css'),
      'utf8',
    );
    const orbRule = readRuleBody(dockCss, '.minigame-utility-dock__orb');

    expect(orbRule).toContain('width: 44px;');
    expect(orbRule).toContain('height: 44px;');
    expect(orbRule).toContain('border-radius: 22px 0 0 22px;');
  });
});
