import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function getRuleDeclarations(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  expect(match, `Expected CSS rule for ${selector}`).toBeTruthy();

  return Object.fromEntries(
    (match?.[1] ?? '')
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separatorIndex = declaration.indexOf(':');
        return [
          declaration.slice(0, separatorIndex).trim(),
          declaration.slice(separatorIndex + 1).trim(),
        ];
      }),
  );
}

const PICKER_BOTTOM_CLEARANCE = 'calc(8.5rem + env(safe-area-inset-bottom, 0px))';
const CONFIRM_BUTTON_OFFSET = 'calc(4.5rem + env(safe-area-inset-bottom, 0px))';

describe('BlackjackTournamentComp styles', () => {
  it('keeps the duel picker scrollable with a reachable sticky confirm button', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/BlackjackTournamentComp/BlackjackTournamentComp.css'),
      'utf8',
    );

    const pickDeclarations = getRuleDeclarations(css, '.bjt-pick');
    expect(pickDeclarations['justify-content']).toBe('flex-start');
    expect(pickDeclarations['overflow-x']).toBe('hidden');
    expect(pickDeclarations['overflow-y']).toBe('auto');
    expect(pickDeclarations['-webkit-overflow-scrolling']).toBe('touch');
    expect(pickDeclarations['overscroll-behavior']).toBe('contain');
    expect(pickDeclarations['padding-bottom']).toBe(PICKER_BOTTOM_CLEARANCE);

    const confirmDeclarations = getRuleDeclarations(css, '.bjt-btn--confirm');
    expect(confirmDeclarations.position).toBe('sticky');
    expect(confirmDeclarations.bottom).toBe(CONFIRM_BUTTON_OFFSET);
    expect(confirmDeclarations['z-index']).toBe('11');
  });
});
