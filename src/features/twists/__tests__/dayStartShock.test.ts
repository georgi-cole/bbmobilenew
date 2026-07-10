import { describe, expect, it, vi } from 'vitest';
import { DAY_START_SHOCK_TEMPLATE_COUNT, buildDayStartShockSelection } from '../dayStartShock';
import type { Player } from '../../../types';

describe('day start shock selection', () => {
  it('ships with 30 templates and selects an active housemate', () => {
    const players: Player[] = [
      { id: 'a', name: 'Alpha', avatar: '🧑', status: 'active' },
      { id: 'b', name: 'Bravo', avatar: '👩', status: 'active' },
      { id: 'c', name: 'Charlie', avatar: '🧑', status: 'evicted' },
    ];
    const rng = vi.fn(() => 0);
    rng.mockReturnValueOnce(0);
    rng.mockReturnValueOnce(0.5);

    const selection = buildDayStartShockSelection(players, rng);

    expect(DAY_START_SHOCK_TEMPLATE_COUNT).toBe(30);
    expect(selection?.targetId).toBe('a');
    expect(selection?.reason).toContain('Alpha');
    expect(selection?.reason).not.toContain('{{name}}');
    expect(selection?.templateId).toBeTruthy();
    expect(rng).toHaveBeenCalledTimes(2);
  });

  it('never selects the user player', () => {
    const players: Player[] = [
      { id: 'user', name: 'You', avatar: '🧑', status: 'active', isUser: true },
      { id: 'ai', name: 'Housemate', avatar: '👩', status: 'active' },
    ];

    const selection = buildDayStartShockSelection(players, () => 0);

    expect(selection?.targetId).toBe('ai');
  });
});
