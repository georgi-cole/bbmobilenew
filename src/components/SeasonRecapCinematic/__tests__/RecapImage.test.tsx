import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RecapImage from '../RecapImage';

describe('RecapImage', () => {
  it('falls through missing tabloid photos without ever staying on a broken source', async () => {
    render(
      <RecapImage
        sources={[
          'assets/tabloid_photos/missing-1.webp',
          'assets/skins/Dex_avatar.webp',
          'assets/silhouette_male - Copy.webp',
        ]}
        alt="Tabloid fallback"
      />,
    );

    const image = screen.getByAltText('Tabloid fallback');
    expect(image.getAttribute('src')).toBe('assets/tabloid_photos/missing-1.webp');
    expect(image.getAttribute('data-image-state')).toBe('pending');

    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe('assets/skins/Dex_avatar.webp');
    expect(image.getAttribute('data-image-state')).toBe('pending');

    fireEvent.error(image);
    expect(image.getAttribute('src')).toBe('assets/silhouette_male - Copy.webp');

    fireEvent.load(image);

    await waitFor(() => {
      expect(image.getAttribute('data-image-state')).toBe('loaded');
      expect(image).toHaveStyle({ opacity: '1' });
    });
  });
});
