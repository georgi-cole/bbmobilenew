const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const BUTTON_VARIANTS = [
  'primary_large',
  'secondary_medium',
  'secondary_wide',
  'secondary_small',
] as const;

const BUTTON_STATES = ['normal', 'hover', 'pressed', 'disabled'] as const;

const INTRO_HUB_SHELL_STATES = ['normal', 'hover', 'pressed', 'disabled'] as const;

const INTRO_HUB_ICONS = [
  'housemates',
  'music',
  'sound',
  'settings',
  'share',
  'feedback',
  'news',
  'achievements',
  'social',
  'shop',
] as const;

const HOME_HUB_BUTTON_ICONS = [
  'play',
  'rules',
  'profile',
  'leaderboard',
  'credits',
  'campaign',
  'survival',
  'back',
] as const;

function assetUrl(path: string): string {
  return `${BASE}${path}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function getHomeHubAssetUrls(effectiveBgUrl: string | null): string[] {
  const urls: string[] = [];

  if (effectiveBgUrl) {
    urls.push(effectiveBgUrl);
  }

  BUTTON_VARIANTS.forEach((variant) => {
    BUTTON_STATES.forEach((state) => {
      urls.push(assetUrl(`/assets/buttons/${variant}_${state}.svg`));
    });
  });

  INTRO_HUB_SHELL_STATES.forEach((state) => {
    urls.push(assetUrl(`/assets/side_utilities_button/side_utility_shell_${state}.svg`));
  });

  urls.push(assetUrl('/assets/side_utilities_button/badge_alert_red.svg'));

  INTRO_HUB_ICONS.forEach((icon) => {
    urls.push(assetUrl(`/assets/side_utilities_button/${icon}_v2.svg`));
  });

  HOME_HUB_BUTTON_ICONS.forEach((icon) => {
    urls.push(assetUrl(`/assets/intro_hub_icons/${icon}.svg`));
  });

  return unique(urls);
}
