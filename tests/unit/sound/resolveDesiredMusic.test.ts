import { describe, expect, it } from 'vitest';
import type { RootState } from '../../../src/store/store';
import { resolveDesiredMusic } from '../../../src/services/sound/resolveDesiredMusic';

function makeState(overrides: Partial<RootState> = {}): RootState {
  const base = {
    game: {
      phase: 'week_start',
      spectatorActive: null,
    },
    challenge: {
      pending: null,
    },
    social: {
      panelOpen: false,
      incomingInboxOpen: false,
    },
    ui: {
      musicScene: 'none',
    },
  } as unknown as RootState;

  return {
    ...base,
    ...overrides,
    game: { ...base.game, ...(overrides.game ?? {}) },
    challenge: { ...base.challenge, ...(overrides.challenge ?? {}) },
    social: { ...base.social, ...(overrides.social ?? {}) },
    ui: { ...base.ui, ...(overrides.ui ?? {}) },
  };
}

describe('resolveDesiredMusic', () => {
  it('prefers a cinematic UI scene over every other source', () => {
    const state = makeState({
      ui: { musicScene: 'season_recap' },
      challenge: {
        pending: {
          phase: 'playing',
          game: { key: 'riskWheel' },
        },
      } as RootState['challenge'],
      social: { panelOpen: true, incomingInboxOpen: false },
      game: { phase: 'loh_comp' },
    });

    expect(resolveDesiredMusic(state, '#/game')).toBe('season_recap');
  });

  it('maps an active minigame to its dedicated music track', () => {
    const state = makeState({
      challenge: {
        pending: {
          phase: 'playing',
          game: { key: 'glass_bridge_brutal' },
        },
      } as RootState['challenge'],
    });

    expect(resolveDesiredMusic(state, '#/game')).toBe('glass_bridge');
  });

  it('reuses the glass bridge music track for Crystal Path: Shattered', () => {
    const state = makeState({
      challenge: {
        pending: {
          phase: 'playing',
          game: { key: 'crystal_path_shattered' },
        },
      } as RootState['challenge'],
    });

    expect(resolveDesiredMusic(state, '#/game')).toBe('glass_bridge');
  });

  it('falls back to social and phase music when no higher-priority scene exists', () => {
    const socialState = makeState({ social: { panelOpen: true, incomingInboxOpen: false } });
    const phaseState = makeState({ game: { phase: 'nominations' } });

    expect(resolveDesiredMusic(socialState, '#/game')).toBe('social');
    expect(resolveDesiredMusic(phaseState, '#/game')).toBe('nominations');
  });

  it('uses introhub music only on the home route when nothing else is active', () => {
    expect(resolveDesiredMusic(makeState(), '#/')).toBe('introhub');
    expect(resolveDesiredMusic(makeState(), '#/leaderboard')).toBe('none');
  });
});
