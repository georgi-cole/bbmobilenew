import { describe, expect, it } from 'vitest';

import tetrisReducer, { initTetris, resetTetris, setHumanScore } from '../src/features/tetris/tetrisSlice';

describe('Tetris rules', () => {
  const payload = {
    participantIds: ['human', 'ai-1', 'ai-2', 'ai-3'],
    participantNames: {
      human: 'You',
      'ai-1': 'AI 1',
      'ai-2': 'AI 2',
      'ai-3': 'AI 3',
    },
    humanPlayerId: 'human',
    competitionType: 'LOH' as const,
    seed: 42,
    aiScores: {
      'ai-1': 900,
      'ai-2': 100,
      'ai-3': 700,
    },
  };

  it('initialises the competition with the supplied participant roster', () => {
    const initial = tetrisReducer(undefined, { type: '@@INIT' });
    const started = tetrisReducer(initial, initTetris(payload));

    expect(started.phase).toBe('playing');
    expect(started.participants).toHaveLength(4);
    expect(started.participants.find((participant) => participant.id === 'human')?.isHuman).toBe(true);
    expect(started.aiScores['ai-1']).toBe(900);
    expect(started.humanScore).toBeNull();
  });

  it('derives the winner and last place from the final score map', () => {
    const initial = tetrisReducer(undefined, { type: '@@INIT' });
    const started = tetrisReducer(initial, initTetris(payload));
    const completed = tetrisReducer(started, setHumanScore(400));

    expect(completed.phase).toBe('complete');
    expect(completed.finalScores).toEqual({
      'ai-1': 900,
      'ai-2': 100,
      'ai-3': 700,
      human: 400,
    });
    expect(completed.winnerId).toBe('ai-1');
    expect(completed.lastPlaceId).toBe('ai-2');

    const ignored = tetrisReducer(completed, setHumanScore(999));
    expect(ignored.humanScore).toBe(400);
    expect(ignored.winnerId).toBe('ai-1');
    expect(ignored.lastPlaceId).toBe('ai-2');
  });

  it('resets back to the idle baseline', () => {
    const reset = tetrisReducer(undefined, resetTetris());

    expect(reset.phase).toBe('idle');
    expect(reset.participants).toEqual([]);
    expect(reset.finalScores).toEqual({});
    expect(reset.outcomeResolved).toBe(false);
  });
});