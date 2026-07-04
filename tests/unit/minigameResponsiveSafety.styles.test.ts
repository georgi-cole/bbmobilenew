import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readCss(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function getRule(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `Expected CSS rule for ${selector}`).toBeTruthy();
  return match?.[1] ?? '';
}

describe('minigame responsive safe-stage styles', () => {
  it('keeps the shared rules modal safe and internally scrollable', () => {
    const css = readCss('src/components/MinigameRules/MinigameRules.css');

    expect(getRule(css, '.minigame-rules-overlay')).toContain('var(--minigame-safe-padding-top');
    expect(getRule(css, '.minigame-rules-overlay')).toContain('var(--minigame-safe-padding-bottom');
    expect(getRule(css, '.minigame-rules-modal')).toContain('max-height: 100%;');
    expect(getRule(css, '.minigame-rules-list')).toContain('overflow-y: auto;');
    expect(getRule(css, '.minigame-rules-actions')).toContain('flex-wrap: wrap;');
  });

  it('applies safe-stage padding to hosted legacy-style roots and close affordances', () => {
    const css = readCss('src/components/MinigameHost/MinigameHost.css');

    expect(css).toContain('.minigame-host-playing > .glass-bridge');
    expect(css).toContain('.minigame-host-playing > .bb-blitz');
    expect(css).toContain('var(--minigame-stage-top-padding)');
    expect(css).toContain('var(--minigame-safe-padding-bottom)');

    const closeRule = getRule(css, '.minigame-host-close-btn');
    expect(closeRule).toContain('calc(var(--minigame-safe-top) + 12px)');
    expect(closeRule).toContain('calc(var(--minigame-safe-right) + 14px)');
  });

  it('preserves safe padding on qtr overlays at normal and phone breakpoints', () => {
    const qtrCss = readCss('src/components/QuickTapRace/QuickTapRace.css');
    const qtrCanvasCss = readCss('src/minigames/quickTapRace/QuickTapRaceCanvasGame.css');

    expect(getRule(qtrCss, '.qtr')).toContain('var(--minigame-safe-top');
    expect(getRule(qtrCss, '.qtr')).toContain('var(--minigame-safe-bottom');
    expect(qtrCss).not.toContain('padding: 10px;');
    expect(getRule(qtrCss, '.qtr__card--canvas')).toContain('max-height: min(760px, 100%);');

    expect(getRule(qtrCanvasCss, '.qtr-canvas')).toContain('var(--minigame-safe-top');
    expect(getRule(qtrCanvasCss, '.qtr-canvas')).toContain('var(--minigame-safe-bottom');
    expect(getRule(qtrCanvasCss, '.qtr-canvas__card')).toContain('max-height: min(760px, 100%);');
  });

  it('keeps representative fixed React minigame overlays inside safe rows', () => {
    const checks = [
      ['src/components/BullseyeBlitz/BullseyeBlitz.css', '.bbl', '.bbl__card'],
      ['src/components/TravelingDots/TravelingDots.css', '.td', '.td__card'],
      ['src/components/PressurePlank/PressurePlank.css', '.pp', '.pp__card'],
    ] as const;

    for (const [path, rootSelector, cardSelector] of checks) {
      const css = readCss(path);
      expect(getRule(css, rootSelector)).toContain('var(--minigame-safe-top');
      expect(getRule(css, rootSelector)).toContain('var(--minigame-safe-bottom');
      expect(getRule(css, rootSelector)).toContain('box-sizing: border-box;');
      expect(getRule(css, cardSelector)).toContain('max-height: 100%;');
    }
  });
});
