import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HouseOfDarknessComp from '../../../src/components/HouseOfDarknessComp/HouseOfDarknessComp';

vi.mock('../../../src/services/sound/SoundManager', () => ({
  SoundManager: {
    play: vi.fn().mockResolvedValue(undefined),
  },
}));

const participants = [
  {
    id: 'human',
    name: 'Georgi',
    isHuman: true,
    precomputedScore: 0,
    previousPR: null,
  },
  {
    id: 'ai-1',
    name: 'Mara',
    isHuman: false,
    precomputedScore: 0,
    previousPR: null,
  },
];

describe('HouseOfDarknessComp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the four-pair opening board and survival HUD', () => {
    const { container } = render(
      <HouseOfDarknessComp
        participantIds={participants.map((participant) => participant.id)}
        participants={participants}
        seed={1234}
      />,
    );

    expect(screen.getByText('House of Darkness')).toBeInTheDocument();
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    expect(screen.getByText('4 pairs')).toBeInTheDocument();
    expect(container.querySelectorAll('.hod-card:not(.hod-card--placeholder)')).toHaveLength(8);
  });

  it('keeps the first chosen card face-up until a second card is selected', () => {
    const { container } = render(
      <HouseOfDarknessComp
        participantIds={participants.map((participant) => participant.id)}
        participants={participants}
        seed={3456}
      />,
    );

    const cards = [...container.querySelectorAll<HTMLButtonElement>('.hod-card:not(.hod-card--placeholder)')];
    fireEvent.click(cards[0]);

    expect(cards[0]).toHaveAttribute('data-flipped', 'true');
    expect(cards.filter((card) => card.getAttribute('data-flipped') === 'true')).toHaveLength(1);
  });

  it('deducts three to five lifespan after a mismatched pair', async () => {
    const { container } = render(
      <HouseOfDarknessComp
        participantIds={participants.map((participant) => participant.id)}
        participants={participants}
        seed={9876}
      />,
    );

    const cards = [...container.querySelectorAll<HTMLButtonElement>('.hod-card:not(.hod-card--placeholder)')];
    const first = cards[0];
    const second = cards.find((card) => card.textContent !== first.textContent);
    expect(second).toBeTruthy();

    fireEvent.click(first);
    fireEvent.click(second!);

    await waitFor(() => {
      const lifeText = container.querySelector('.hod-life-copy strong')?.textContent ?? '';
      const life = Number.parseFloat(lifeText);
      expect(life).toBeGreaterThanOrEqual(95);
      expect(life).toBeLessThanOrEqual(97);
    });
  });
});
