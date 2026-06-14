import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FullSizeCutoutImage from '../FullSizeCutoutImage';

describe('FullSizeCutoutImage', () => {
  it('falls back to the matching full-body image when a mapped cutout fails to load', async () => {
    render(
      <FullSizeCutoutImage
        player={{ id: 'mimi', name: 'Mimi', avatar: '👩' }}
        alt="Mimi"
      />,
    );

    const image = screen.getByAltText('Mimi');
    expect(image.getAttribute('src')).toBe('assets/Informal_attires/Mimi_informal.png');

    fireEvent.error(image);

    await waitFor(() => {
      expect(image.getAttribute('src')).toBe('assets/full_body_fallback_female.png');
    });
  });

  it('uses the male full-body fallback for male players with no cutout', () => {
    render(
      <FullSizeCutoutImage
        player={{ id: 'dex', name: 'Dex', avatar: '🧑' }}
        alt="Dex"
      />,
    );

    const image = screen.getByAltText('Dex');
    expect(image.getAttribute('src')).toBe('assets/full_body_fallback_male.png');
  });

  it('uses the neutral full-body fallback for user players with no gendered cutout', () => {
    render(
      <FullSizeCutoutImage
        player={{ id: 'user', name: 'You', avatar: '🧑' }}
        alt="You"
      />,
    );

    const image = screen.getByAltText('You');
    expect(image.getAttribute('src')).toBe('assets/full_body_fallback_neutral.png');
  });
});
