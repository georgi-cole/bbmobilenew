import { act } from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FinaleNewspaperMontage from '../FinaleNewspaperMontage';
import { SAMPLE_FINALE_NEWSPAPER_PAGES } from '../newspaperFrontPages';

describe('FinaleNewspaperMontage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds each newspaper on screen longer before advancing the front page', () => {
    const pages = SAMPLE_FINALE_NEWSPAPER_PAGES.slice(0, 4);
    const { container } = render(<FinaleNewspaperMontage pages={pages} durationMs={6800} />);

    const currentFrontPage = () => container.querySelector('.src-news-montage__paper[aria-hidden="false"]');

    expect(currentFrontPage()?.textContent).toContain(pages[0]?.headline);

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(currentFrontPage()?.textContent).toContain(pages[0]?.headline);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(currentFrontPage()?.textContent).toContain(pages[1]?.headline);
  });
});
