import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import FullSizeCutoutImage from '../FullSizeCutoutImage';

describe('FullSizeCutoutImage', () => {
  it('falls back to the matching silhouette when a mapped cutout fails to load', async () => {
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
      expect(image.getAttribute('src')).toBe('assets/silhouette_female - Copy.webp');
    });
  });

  it('uses the silhouette immediately when no dedicated cutout exists', () => {
    render(
      <FullSizeCutoutImage
        player={{ id: 'dex', name: 'Dex', avatar: '🧑' }}
        alt="Dex"
      />,
    );

    expect(screen.getByAltText('Dex').getAttribute('src')).toBe(
      'assets/silhouette_male - Copy.webp',
    );
  });
});
