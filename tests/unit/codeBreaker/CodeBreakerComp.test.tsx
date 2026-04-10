import type { ComponentProps } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import CodeBreakerComp from '../../../src/components/CodeBreakerComp/CodeBreakerComp';
import {
  computeSolvedScore,
  generateSecretCode,
} from '../../../src/components/CodeBreakerComp/codeBreakerLogic';

function makeStore() {
  return configureStore({
    reducer: {
      game: (state = {}) => state,
    },
  });
}

function renderCodeBreaker(props: Partial<ComponentProps<typeof CodeBreakerComp>> = {}) {
  const store = makeStore();
  const onFinish = vi.fn();

  const view = render(
    <Provider store={store}>
      <CodeBreakerComp seed={42} onFinish={onFinish} {...props} />
    </Provider>,
  );

  return { ...view, onFinish };
}

describe('CodeBreakerComp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows attempts and elapsed status chips instead of a countdown timer', () => {
    renderCodeBreaker();

    expect(screen.getByLabelText('Vault status')).toBeInTheDocument();
    expect(screen.getByText('Attempts')).toBeInTheDocument();
    expect(screen.getByText('Elapsed')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.queryByText(/time's up/i)).not.toBeInTheDocument();
  });

  it('keeps the vault surface as a full-height scroll container for long attempt logs', () => {
    const { container } = renderCodeBreaker();

    const root = container.querySelector('.cb');
    expect(root).toBeTruthy();

    const styleTag = document.createElement('style');
    styleTag.textContent = readFileSync(
      resolve(process.cwd(), 'src/components/CodeBreakerComp/CodeBreakerComp.css'),
      'utf8',
    );
    document.head.appendChild(styleTag);

    const style = getComputedStyle(root as HTMLElement);
    expect(style.height).toBe('100%');
    expect(style.overflowX).toBe('hidden');
    expect(style.overflowY).toBe('auto');

    styleTag.remove();
  });

  it('scores a solved run from attempts and elapsed time', async () => {
    const { onFinish } = renderCodeBreaker();

    fireEvent.click(screen.getByRole('button', { name: 'Test Combination' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    const secretCode = generateSecretCode(42);
    secretCode.forEach((digit, index) => {
      const currentDigit = screen.getByLabelText(`Digit ${index + 1}: 0`);
      const delta = digit % 10;
      expect(currentDigit).toBeInTheDocument();

      for (let step = 0; step < delta; step++) {
        fireEvent.click(screen.getByRole('button', { name: `Increase digit ${index + 1}` }));
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Test Combination' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(computeSolvedScore(2, 15_000));
    expect(screen.getByText('Vault breached in 2 attempts')).toBeInTheDocument();
  });
});
