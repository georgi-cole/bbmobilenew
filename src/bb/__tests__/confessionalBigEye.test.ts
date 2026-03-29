import { describe, expect, it } from 'vitest';
import {
  createInitialBigEyeState,
  detectIntent,
  getResponse,
  normalizeInput,
  resolveBigEyeTurn,
} from '../confessionalBigEye';

describe('confessionalBigEye', () => {
  it('normalizes free text consistently', () => {
    expect(normalizeInput('  Hello, THERE!!!  ')).toBe('hello there');
  });

  it('maps yes/no variations to global intents', () => {
    expect(detectIntent('why not')).toBe('yes');
    expect(detectIntent('not really')).toBe('no');
  });

  it('matches phrase variants to the same intent', () => {
    expect(detectIntent("I'm bored")).toBe('boredom');
    expect(detectIntent('This is boring')).toBe('boredom');
    expect(detectIntent('I wanna leave')).toBe('self_eviction');
  });

  it('supports the hidden easter egg phrases', () => {
    expect(detectIntent('are you real')).toBe('realness');
    expect(detectIntent('who will win')).toBe('winner_prediction');
    expect(detectIntent('help me')).toBe('help_request');
    expect(detectIntent('I love you')).toBe('love_confession');
  });

  it('handles repeated greeting spam as a special case', () => {
    const reply = resolveBigEyeTurn('hello hello hello', { random: () => 0.4 }, createInitialBigEyeState());
    expect(reply.intent).toBe('greeting_repeat');
    expect(reply.text).toBe('I heard you the first time.');
  });

  it('falls back to mystical responses for unknown intent', () => {
    const reply = resolveBigEyeTurn('the moon tastes purple', { random: () => 0.4 }, createInitialBigEyeState());
    expect(reply.intent).toBe('unknown');
    expect(reply.text.length).toBeGreaterThan(0);
  });

  it('stores offer_game state after boredom and launches tic tac toe on yes', () => {
    const first = resolveBigEyeTurn('I am bored', { random: () => 0.4 }, createInitialBigEyeState());
    expect(first.nextState.lastQuestion).toBe('offer_game');

    const second = getResponse('yes', { random: () => 0.4 }, first.nextState);
    expect(second.action).toBe('launch_tic_tac_toe');
    expect(second.nextState.lastQuestion).toBeNull();
  });

  it('returns the specific boredom rejection line when the player says no', () => {
    const first = resolveBigEyeTurn('nothing to do', { random: () => 0.4 }, createInitialBigEyeState());
    const second = getResponse('no', { random: () => 0.1 }, first.nextState);

    expect(second.text).toBe('Then sit with it. Discomfort reveals truth.');
    expect(second.nextState.lastQuestion).toBeNull();
  });
});
