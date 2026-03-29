import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('BlackjackTournamentComp styles', () => {
  it('keeps the duel picker scrollable with a reachable sticky confirm button', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/BlackjackTournamentComp/BlackjackTournamentComp.css'),
      'utf8',
    );

    const pickRule = /\.bjt-pick\s*\{[\s\S]*?justify-content:\s*flex-start;[\s\S]*?overflow-y:\s*auto;[\s\S]*?-webkit-overflow-scrolling:\s*touch;[\s\S]*?overscroll-behavior:\s*contain;[\s\S]*?padding-bottom:\s*calc\(8\.5rem \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?\}/;
    const confirmRule = /\.bjt-btn--confirm\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?bottom:\s*calc\(4\.5rem \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?z-index:\s*11;[\s\S]*?\}/;

    expect(css).toMatch(pickRule);
    expect(css).toMatch(confirmRule);
  });
});
