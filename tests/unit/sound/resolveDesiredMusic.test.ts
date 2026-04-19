import { describe, expect, it } from 'vitest';
import type { RootState } from '../../../src/store/store';
import { resolveDesiredMusic } from '../../../src/services/sound/resolveDesiredMusic';

function makeState(overrides: Partial<RootState> = {}): RootState {
  const base = {
    game: {
      gameId: 'game-1',
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

  it('reuses the glass bridge music track for Crystal Path: Infinity', () => {
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

  it('stays silent on the home route when nothing else is active', () => {
    expect(resolveDesiredMusic(makeState(), '#/')).toBe('none');
    expect(resolveDesiredMusic(makeState(), '#/leaderboard')).toBe('none');
  });

  // ── Finale phase scenes ──────────────────────────────────────────────────────

  it('tribunal_part1 scene maps to the jury_voting music track', () => {
    const state = makeState({ ui: { musicScene: 'tribunal_part1' } });
    expect(resolveDesiredMusic(state, '#/game')).toBe('jury_voting');
  });

  it('tribunal_part1 scene overrides game phase and social music', () => {
    const state = makeState({
      ui: { musicScene: 'tribunal_part1' },
      game: { phase: 'nominations' },
      social: { panelOpen: true, incomingInboxOpen: false },
    });
    expect(resolveDesiredMusic(state, '#/game')).toBe('jury_voting');
  });

  it('jury_voting scene maps to the jury_voting music track', () => {
    const state = makeState({ ui: { musicScene: 'jury_voting' } });
    expect(resolveDesiredMusic(state, '#/game')).toBe('jury_voting');
  });

  it('public_voting scene resolves to none (no dedicated track yet)', () => {
    // public_voting has no track assigned — trackForMusicScene returns 'none',
    // so the resolver falls through to game-phase logic (week_start → 'none').
    const state = makeState({ ui: { musicScene: 'public_voting' } });
    expect(resolveDesiredMusic(state, '#/game')).toBe('none');
  });

  it('public_voting scene does not block a competing game-phase track', () => {
    // Because public_voting → 'none' the scene is transparent and the resolver
    // falls through to game-phase logic.
    const state = makeState({
      ui: { musicScene: 'public_voting' },
      game: { phase: 'nominations' },
    });
    expect(resolveDesiredMusic(state, '#/game')).toBe('nominations');
  });
});
