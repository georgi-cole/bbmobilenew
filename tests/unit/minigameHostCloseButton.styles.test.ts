import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression test for issue #951 (item 7): the host "✕" exit button was hidden
 * behind full-viewport minigame roots such as Bullseye Blitz (a fixed overlay
 * at z-index 200 rendered after the button), so there was no way to escape.
 * The close button must stack above any minigame root.
 */
describe('MinigameHost close button layering', () => {
  function readRuleBody(css: string, selector: string): string {
    const start = css.indexOf(`${selector} {`);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = css.indexOf('}', start);
    expect(end).toBeGreaterThan(start);
    return css.slice(start, end);
  }

  function readZIndex(body: string): number {
    const match = body.match(/z-index:\s*(\d+)/);
    expect(match).not.toBeNull();
    return Number(match![1]);
  }

  it('stacks the exit button above the Bullseye Blitz full-viewport root', () => {
    const hostCss = readFileSync(
      resolve(process.cwd(), 'src/components/MinigameHost/MinigameHost.css'),
      'utf8',
    );
    const bullseyeCss = readFileSync(
      resolve(process.cwd(), 'src/components/BullseyeBlitz/BullseyeBlitz.css'),
      'utf8',
    );

    const closeZ = readZIndex(readRuleBody(hostCss, '.minigame-host-close-btn'));
    const bullseyeRootZ = readZIndex(readRuleBody(bullseyeCss, '.bbl'));

    expect(closeZ).toBeGreaterThan(bullseyeRootZ);
  });
});
