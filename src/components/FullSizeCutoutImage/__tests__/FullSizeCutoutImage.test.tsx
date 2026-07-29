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
    expect(image.getAttribute('src')).toContain('Mimi_informal.png');
    expect(image.style.opacity).toBe('1');

    fireEvent.error(image);

    await waitFor(() => {
      expect(image.getAttribute('src')).toContain('full_body_fallback_female.png');
    });
  });

  it('uses a real informal cutout when one is available', () => {
    render(
      <FullSizeCutoutImage
        player={{ id: 'dex', name: 'Dex', avatar: '🧑' }}
        alt="Dex"
      />,
    );

    const image = screen.getByAltText('Dex');
    expect(image.getAttribute('src')).toContain('Dex_informal.webp');
  });

  it('uses the formal cutout when the voting stage requests formal attire', () => {
    render(
      <FullSizeCutoutImage
        player={{ id: 'lia', name: 'Lia', avatar: '/lia.webp' }}
        attire="formal"
        alt="Lia at the Tribunal"
      />,
    );

    expect(screen.getByAltText('Lia at the Tribunal').getAttribute('src')).toContain(
      'Lia_formal.png',
    );
  });

  it('prefers the supported PNG when a legacy formal format also exists', () => {
    render(
      <FullSizeCutoutImage
        player={{ id: 'blue', name: 'Blue', avatar: '/blue.webp' }}
        attire="formal"
        alt="Blue at the ceremony"
      />,
    );

    expect(screen.getByAltText('Blue at the ceremony').getAttribute('src')).toContain(
      'Blue_formal.png',
    );
  });

  it('uses the neutral full-body fallback for user players with no gendered cutout', () => {
    render(
      <FullSizeCutoutImage
        player={{ id: 'user', name: 'You', avatar: '🧑' }}
        alt="You"
      />,
    );

    const image = screen.getByAltText('You');
    expect(image.getAttribute('src')).toContain('full_body_fallback_neutral.png');
  });
});
