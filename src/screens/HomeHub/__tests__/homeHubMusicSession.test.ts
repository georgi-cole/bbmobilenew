import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasStartedHomeHubGame,
  markHomeHubGameStarted,
} from '../homeHubMusicSession';

describe('homeHubMusicSession', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tracks whether introhub music has already been consumed for the current game', () => {
    expect(hasStartedHomeHubGame('game-a')).toBe(false);

    markHomeHubGameStarted('game-a');

    expect(hasStartedHomeHubGame('game-a')).toBe(true);
    expect(hasStartedHomeHubGame('game-b')).toBe(false);
  });
});
