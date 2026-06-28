import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useBackgroundTheme from '../useBackgroundTheme';

const resolveThemeMock = vi.fn();
const preloadImageMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../utils/backgroundTheme', () => ({
  ASSETS_BASE: '/assets/skins/',
  DEFAULT_FILE: 'daily-background.png',
  resolveTheme: (...args: unknown[]) => resolveThemeMock(...args),
}));

vi.mock('../../utils/preload', () => ({
  preloadImage: (...args: unknown[]) => preloadImageMock(...args),
}));

function Probe() {
  const { url, reason } = useBackgroundTheme();
  return <div data-testid="probe">{`${url ?? 'null'}|${reason ?? 'null'}`}</div>;
}

describe('useBackgroundTheme', () => {
  beforeEach(() => {
    resolveThemeMock.mockReset();
    preloadImageMock.mockClear();
  });

  it('starts with a known-good bootstrap background before async theme resolution finishes', () => {
    resolveThemeMock.mockReturnValue(new Promise(() => {}));

    render(<Probe />);

    expect(screen.getByTestId('probe').textContent).toBe('/assets/skins/daily-background.png|boot-fallback');
  });

  it('replaces the bootstrap background once the dynamic theme resolves', async () => {
    resolveThemeMock.mockResolvedValue({
      key: 'night',
      url: '/assets/skins/bg-night.jpg',
      reason: 'timeofday',
    });

    render(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId('probe').textContent).toBe('/assets/skins/bg-night.jpg|timeofday');
    });

    expect(preloadImageMock).toHaveBeenCalledWith('/assets/skins/bg-night.jpg');
  });
});
