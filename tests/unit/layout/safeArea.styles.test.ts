import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('safe-area layout styles', () => {
  it('defines a shared top safe-area fallback and applies it in the app shell', () => {
    const globalCss = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const appShellCss = readFileSync(
      resolve(process.cwd(), 'src/components/layout/AppShell.css'),
      'utf8',
    );

    expect(globalCss).toContain('--safe-area-inset-top: env(safe-area-inset-top, 0px);');
    expect(globalCss).toContain('--app-safe-area-top-fallback: 0px;');
    expect(globalCss).toContain(
      '--app-safe-area-top: max(var(--app-safe-area-top-fallback), var(--safe-area-inset-top));',
    );
    expect(globalCss).toContain(
      '--app-safe-area-top-extra: max(0px, calc(var(--app-safe-area-top) - 16px));',
    );
    expect(globalCss).toContain('html.is-capacitor,');
    expect(globalCss).toContain('html.is-chrome-android {');
    expect(globalCss).toContain('--app-safe-area-top-fallback: 16px;');
    expect(appShellCss).toContain('padding-top: var(--app-safe-area-top-extra);');
    expect(appShellCss).toContain('padding-bottom: var(--safe-area-inset-bottom);');
  });

  it('keeps explicit back-header screens aligned to the shared 16px baseline', () => {
    const diaryRoomCss = readFileSync(
      resolve(process.cwd(), 'src/screens/DiaryRoom/DiaryRoom.css'),
      'utf8',
    );
    const gameDebugCss = readFileSync(
      resolve(process.cwd(), 'src/screens/GameDebug/GameDebug.css'),
      'utf8',
    );

    expect(diaryRoomCss).toContain('padding: 16px 16px 10px;');
    expect(gameDebugCss).toContain('padding: 1rem 1rem 0.5rem;');
  });
});
