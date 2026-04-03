import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = process.cwd();
const introHubScript = readFileSync(path.join(repoRoot, 'public/js/ui/introHub.js'), 'utf8');
const introHubCss = readFileSync(path.join(repoRoot, 'public/css/intro-hub.css'), 'utf8');
const mirroredIntroHubScript = readFileSync(
  path.join(repoRoot, 'public/bbmobilenew/js/ui/introHub.js'),
  'utf8',
);
const mirroredIntroHubCss = readFileSync(
  path.join(repoRoot, 'public/bbmobilenew/css/intro-hub.css'),
  'utf8',
);

function setNavigatorShare(shareImpl?: ((data: unknown) => Promise<void>) | undefined) {
  Object.defineProperty(window.navigator, 'share', {
    configurable: true,
    value: shareImpl,
  });
}

function loadIntroHub(gameOverrides: Record<string, unknown> = {}) {
  document.body.innerHTML = '<div id="intro-hub"></div>';
  delete (window as Window & { game?: unknown }).game;
  (window as Window & { game?: unknown }).game = { ...gameOverrides };
  new Function(introHubScript)();
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as Window & { game?: unknown }).game;
  delete (window as Window & { game?: unknown }).HouseguestsModal;
  setNavigatorShare(undefined);
  vi.restoreAllMocks();
});

describe('IntroHub side utility buttons', () => {
  it('renders icon class hooks for the side utility asset pack', () => {
    loadIntroHub();

    expect(document.querySelector('[data-hub-id="houseguests"] .hub-chip__icon--housemates')).not.toBeNull();
    expect(document.querySelector('[data-hub-id="sounds"] .hub-chip__icon--sound')).not.toBeNull();
    expect(document.querySelector('[data-hub-id="store"] .hub-chip__icon--shop')).not.toBeNull();
    expect(document.querySelector('[data-hub-id="social"] .hub-chip__icon--social')).not.toBeNull();
    expect(document.querySelector('button[data-hub-stack]')).toBeNull();
    expect(document.querySelector('[data-hub-id="achievements"]')?.getAttribute('data-hub-chip-stack')).toBe(
      'leftTopStack',
    );
    expect(mirroredIntroHubScript).toContain("icon: 'housemates'");
    expect(mirroredIntroHubScript).toContain("stack: 'leftTopStack'");
    expect(mirroredIntroHubScript).toContain("stack: 'rightBottomStack'");
    expect(mirroredIntroHubScript).toContain("btn.setAttribute('data-hub-chip-stack', def.stack);");
    expect(mirroredIntroHubScript).toContain(
      "icon.className = `hub-chip__icon hub-chip__icon--${def.icon}`;",
    );
    expect(mirroredIntroHubScript).toContain('navigator.share');
    expect(mirroredIntroHubScript).toContain('collectAchievementStats');
    expect(mirroredIntroHubScript).toContain('kolequant@gmail.com');
    expect(mirroredIntroHubScript).toContain('Competitive / Wins');
    expect(mirroredIntroHubScript).toContain('Trophy case');
  });

  it('styles the IntroHub chips with side utility shell and badge assets', () => {
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_normal.svg');
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_hover.svg');
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_pressed.svg');
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_disabled.svg');
    expect(introHubCss).toContain('../assets/side_utilities_button/badge_alert_red.svg');
    expect(introHubCss).toContain('.hub-chip__icon--housemates');
    expect(introHubCss).toContain('.hub-chip__icon--shop');
    expect(introHubCss).toContain('--hub-chip-top-safe-area-base: 0px;');
    expect(introHubCss).toContain('--hub-chip-top-safe-area: max(');
    expect(introHubCss).toContain('var(--app-safe-area-top, env(safe-area-inset-top, 0px))');
    expect(introHubCss).toContain('--hub-chip-top-stack-offset: calc(var(--hub-chip-top-safe-area) + 18px);');
    expect(introHubCss).toContain('html.is-chrome-android {');
    expect(introHubCss).toContain('--hub-chip-top-safe-area-base: 16px;');
    expect(introHubCss).toContain('.hub-chip-stack');
    expect(introHubCss).toContain('.leftTopStack');
    expect(introHubCss).toContain('.rightBottomStack');
    expect(introHubCss).toContain('gap: var(--hub-chip-gap);');
    expect(introHubCss).toMatch(/#intro-hub\s*\{[^}]*pointer-events:\s*none;/s);
    expect(introHubCss).toMatch(/\.hub-chip\s*\{[^}]*pointer-events:\s*auto;/s);
    expect(introHubCss).toContain('touch-action: manipulation;');
    expect(introHubCss).toContain('top: var(--hub-chip-top-stack-offset);');
    expect(introHubCss).toContain('bottom: calc(var(--hub-chip-bottom-offset) + env(safe-area-inset-bottom, 0px));');
    expect(introHubCss).not.toContain('.hub-chip--top-left');
    expect(introHubCss).not.toContain('--hub-chip-stack-step');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/side_utility_shell_normal.svg');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/side_utility_shell_hover.svg');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/side_utility_shell_pressed.svg');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/side_utility_shell_disabled.svg');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/badge_alert_red.svg');
    expect(mirroredIntroHubCss).toContain('.hub-chip__icon--housemates');
    expect(mirroredIntroHubCss).toContain('.hub-chip__icon--shop');
    expect(mirroredIntroHubCss).toContain('--hub-chip-top-safe-area-base: 0px;');
    expect(mirroredIntroHubCss).toContain('--hub-chip-top-safe-area: max(');
    expect(mirroredIntroHubCss).toContain('var(--app-safe-area-top, env(safe-area-inset-top, 0px))');
    expect(mirroredIntroHubCss).toContain(
      '--hub-chip-top-stack-offset: calc(var(--hub-chip-top-safe-area) + 18px);',
    );
    expect(mirroredIntroHubCss).toContain('html.is-chrome-android {');
    expect(mirroredIntroHubCss).toContain('--hub-chip-top-safe-area-base: 16px;');
    expect(mirroredIntroHubCss).toContain('.hub-chip-stack');
    expect(mirroredIntroHubCss).toContain('.leftTopStack');
    expect(mirroredIntroHubCss).toContain('.rightBottomStack');
    expect(mirroredIntroHubCss).toContain('gap: var(--hub-chip-gap);');
    expect(mirroredIntroHubCss).toContain('pointer-events: none;');
    expect(mirroredIntroHubCss).toContain('pointer-events: auto;');
    expect(mirroredIntroHubCss).toContain('touch-action: manipulation;');
    expect(mirroredIntroHubCss).toContain('top: var(--hub-chip-top-stack-offset);');
    expect(mirroredIntroHubCss).toContain(
      'bottom: calc(var(--hub-chip-bottom-offset) + env(safe-area-inset-bottom, 0px));',
    );
    expect(mirroredIntroHubCss).not.toContain('.hub-chip--top-left');
    expect(mirroredIntroHubCss).not.toContain('--hub-chip-stack-step');
  });

  it('renders the reordered utility chips into four mirrored stacks', () => {
    loadIntroHub();

    expect(
      Array.from(document.querySelectorAll('[data-hub-stack="leftTopStack"] [data-hub-id]')).map(el =>
        el.getAttribute('data-hub-id'),
      ),
    ).toEqual(['achievements', 'music', 'sounds']);
    expect(
      Array.from(document.querySelectorAll('[data-hub-stack="leftBottomStack"] [data-hub-id]')).map(el =>
        el.getAttribute('data-hub-id'),
      ),
    ).toEqual(['houseguests', 'news']);
    expect(
      Array.from(document.querySelectorAll('[data-hub-stack="rightTopStack"] [data-hub-id]')).map(el =>
        el.getAttribute('data-hub-id'),
      ),
    ).toEqual(['social', 'share', 'feedback']);
    expect(
      Array.from(document.querySelectorAll('[data-hub-stack="rightBottomStack"] [data-hub-id]')).map(el =>
        el.getAttribute('data-hub-id'),
      ),
    ).toEqual(['settings', 'store']);
  });

  it('uses the native share sheet when the share chip is tapped', async () => {
    const shareSpy = vi.fn().mockResolvedValue(undefined);
    setNavigatorShare(shareSpy);
    loadIntroHub();

    document.querySelector<HTMLButtonElement>('[data-hub-id="share"]')?.click();
    await Promise.resolve();

    expect(shareSpy).toHaveBeenCalledWith({
      title: 'BBMobile New',
      text: 'Share BBMobile New with your friends and compare your house legacy.',
      url: window.location.href,
    });
    expect(document.getElementById('hub-dialog-panel')).toBeNull();
  });

  it('opens the feedback email composer for the support inbox', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(window);
    loadIntroHub({ season: 3, week: 7 });

    document.querySelector<HTMLButtonElement>('[data-hub-id="feedback"]')?.click();

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0];
    expect(url).toContain('mailto:kolequant@gmail.com');
    expect(url).toContain('BBMobile%20New%20feedback');
    expect(url).toContain('Season%203');
    expect(url).toContain('Day%207');
    expect(target).toBe('_self');
  });

  it('shows placeholder achievement values when no season history exists yet', () => {
    loadIntroHub({
      players: [
        {
          id: 'user',
          name: 'You',
          isUser: true,
          status: 'active',
          stats: {
            lohWins: 0,
            posWins: 0,
            timesNominated: 0,
          },
        },
      ],
      week: 1,
      phase: 'week_start',
    });

    document.querySelector<HTMLButtonElement>('[data-hub-id="achievements"]')?.click();

    const dialog = document.getElementById('hub-dialog-panel');
    expect(dialog?.textContent).toContain('Trophy case');
    expect(dialog?.textContent).toContain('Avg survive');
    expect(dialog?.textContent).toContain('—');
    expect(dialog?.textContent).toContain('Competitive / Wins');
    expect(dialog?.textContent).toContain('Your next badge unlocks once you finish a full season.');
  });

  it('shows a career achievements dialog with aggregated stats', () => {
    loadIntroHub({
      season: 4,
      week: 6,
      phase: 'nominations',
      players: [
        {
          id: 'user',
          name: 'You',
          isUser: true,
          status: 'active',
          stats: {
            lohWins: 1,
            posWins: 1,
            timesNominated: 1,
            battleBackWins: 0,
            wonFinalHoh: false,
          },
        },
      ],
      seasonArchives: [
        {
          seasonIndex: 3,
          seasonId: 'season-3',
          rewardsEarned: ['egg-one', 'egg-two'],
          playerSummaries: [
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 1,
              lohWins: 2,
              posWins: 1,
              timesNominated: 3,
              battleBackWins: 0,
              wonPublicFavorite: true,
              wonFinalHoh: true,
              survivedDoubleEviction: true,
              weeksAlive: 10,
              isEvicted: false,
              madeJury: false,
            },
          ],
        },
        {
          seasonIndex: 2,
          seasonId: 'season-2',
          rewardsEarned: ['egg-two', 'egg-three'],
          playerSummaries: [
            {
              playerId: 'user',
              displayName: 'You',
              finalPlacement: 4,
              lohWins: 1,
              posWins: 2,
              timesNominated: 2,
              battleBackWins: 1,
              wonPublicFavorite: false,
              wonFinalHoh: false,
              survivedTripleEviction: true,
              weeksAlive: 5,
              isEvicted: true,
              madeJury: true,
            },
          ],
        },
      ],
    });

    document.querySelector<HTMLButtonElement>('[data-hub-id="achievements"]')?.click();

    const dialog = document.getElementById('hub-dialog-panel');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.textContent).toContain('Achievements');
    expect(dialog?.textContent).toContain('Trophy case');
    expect(dialog?.textContent).toContain('Season wins');
    expect(dialog?.textContent).toContain('Comp wins');
    expect(dialog?.textContent).toContain('Avg survive');
    expect(dialog?.textContent).toContain('7 days');
    expect(dialog?.textContent).toContain('Competitive / Wins');
    expect(dialog?.textContent).toContain('Recognition / Social');
    expect(dialog?.textContent).toContain('Survival / Endurance');
    expect(dialog?.textContent).toContain('Fan favorite');
    expect(dialog?.textContent).toContain('Rewards found');
    expect(dialog?.textContent).toContain('Block escapes');
    expect(dialog?.textContent).toContain('Comp beast ×9');
    expect(dialog?.textContent).toContain('Reward hunter ×3');
  });
});
