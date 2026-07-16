import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Crystal Path: Infinity wrong-tile styles', () => {
  it('keeps wrong tiles in place so they crack instead of shattering away', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/minigames/crystalPathShattered/crystalPathShattered.css'),
      'utf8',
    );

    const wrongTileRuleMatch = css.match(/\.cps-tile\.is-wrong\s*\{[\s\S]*?\}/);

    expect(wrongTileRuleMatch).not.toBeNull();
    expect(css).toContain('@keyframes cps-tile-wrong-shake {');
    expect(wrongTileRuleMatch?.[0]).toContain('animation: cps-tile-wrong-shake 0.46s ease-in-out;');
    expect(wrongTileRuleMatch?.[0]).not.toContain('cps-tile-shatter-fall');
  });

  it('lets the full results page scroll instead of cutting standings into a nested scroller', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/minigames/crystalPathShattered/crystalPathShattered.css'),
      'utf8',
    );
    const component = readFileSync(
      resolve(process.cwd(), 'src/minigames/crystalPathShattered/CrystalPathShatteredGame.tsx'),
      'utf8',
    );

    expect(component).toContain('cps-shell cps-shell--complete');
    expect(component).not.toContain('continueButtonClassName="cps-btn cps-btn-primary"');
    expect(css).toMatch(/\.cps-placements\s*\{[^}]*max-height:\s*none;[^}]*overflow:\s*visible;/s);
    expect(css).not.toContain('max-height: 40dvh;');
  });

  it('uses a longer catastrophe animation when the bridge collapses', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/minigames/crystalPathShattered/crystalPathShattered.css'),
      'utf8',
    );

    expect(css).toContain('animation: cps-void-blackout 1.6s ease forwards;');
    expect(css).toContain('animation: cps-tile-shatter-fall 1.6s ease forwards;');
    expect(css).toContain('animation: cps-void-collapse 1.6s cubic-bezier(0.22, 0.72, 0.2, 1) forwards;');
  });

  it('provides the shared reddish Continue action as the wrapper default', () => {
    const wrapper = readFileSync(
      resolve(process.cwd(), 'src/components/MinigameHost/MinigameCompleteWrapper.tsx'),
      'utf8',
    );
    const commonCss = readFileSync(
      resolve(process.cwd(), 'src/components/MinigameHost/minigameCommon.css'),
      'utf8',
    );

    expect(wrapper).toContain("continueButtonClassName ?? 'minigame-complete-continue'");
    expect(commonCss).toMatch(/\.minigame-complete-continue\s*\{[^}]*min-height:\s*48px;[^}]*background:\s*#e94560;/s);
  });
});
