import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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

function loadIntroHub() {
  document.body.innerHTML = '<div id="intro-hub"></div>';
  delete (window as Window & { game?: unknown }).game;
  new Function(introHubScript)();
}

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as Window & { game?: unknown }).game;
});

describe('IntroHub side utility buttons', () => {
  it('renders icon class hooks for the side utility asset pack', () => {
    loadIntroHub();

    expect(document.querySelector('[data-hub-id="houseguests"] .hub-chip__icon--housemates')).not.toBeNull();
    expect(document.querySelector('[data-hub-id="sounds"] .hub-chip__icon--sound')).not.toBeNull();
    expect(document.querySelector('[data-hub-id="store"] .hub-chip__icon--shop')).not.toBeNull();
    expect(document.querySelector('[data-hub-id="social"] .hub-chip__icon--social')).not.toBeNull();
    expect(mirroredIntroHubScript).toContain("icon: 'housemates'");
    expect(mirroredIntroHubScript).toContain('hub-chip__icon--${def.icon}');
  });

  it('styles the IntroHub chips with side utility shell and badge assets', () => {
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_normal.svg');
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_hover.svg');
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_pressed.svg');
    expect(introHubCss).toContain('../assets/side_utilities_button/side_utility_shell_disabled.svg');
    expect(introHubCss).toContain('../assets/side_utilities_button/badge_alert_red.svg');
    expect(introHubCss).toContain('.hub-chip__icon--housemates');
    expect(introHubCss).toContain('.hub-chip__icon--shop');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/side_utility_shell_normal.svg');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/side_utility_shell_hover.svg');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/side_utility_shell_pressed.svg');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/side_utility_shell_disabled.svg');
    expect(mirroredIntroHubCss).toContain('../../assets/side_utilities_button/badge_alert_red.svg');
    expect(mirroredIntroHubCss).toContain('.hub-chip__icon--housemates');
    expect(mirroredIntroHubCss).toContain('.hub-chip__icon--shop');
  });
});
