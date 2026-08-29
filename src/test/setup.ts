import '@testing-library/jest-dom';
import { createElement, type JSXElementConstructor, type ReactNode } from 'react';
import { vi } from 'vitest';
import { I18nContext, type I18nContextValue } from '../i18n/I18nContext';
import { translate } from '../i18n/messages';

const TEST_I18N: I18nContextValue = {
  preference: 'en-US',
  language: 'en-US',
  systemLanguage: 'en-US',
  t: (key, params) => translate('en-US', key, params),
  formatNumber: (value, options) => new Intl.NumberFormat('en-US', options).format(value),
  formatDate: (value, options) => new Intl.DateTimeFormat('en-US', options).format(value),
};

function EnglishI18nBoundary({ children }: { children: ReactNode }) {
  return createElement(I18nContext.Provider, { value: TEST_I18N }, children);
}

vi.mock('@testing-library/react', async () => {
  const actual = await vi.importActual<typeof import('@testing-library/react')>(
    '@testing-library/react',
  );

  const withI18nWrapper = (
    customWrapper?: JSXElementConstructor<{ children: ReactNode }>,
  ): JSXElementConstructor<{ children: ReactNode }> => {
    if (!customWrapper) return EnglishI18nBoundary;

    return function TestWrapper({ children }: { children: ReactNode }) {
      return createElement(
        EnglishI18nBoundary,
        null,
        createElement(customWrapper, null, children),
      );
    };
  };

  return {
    ...actual,
    render: (
      ui: Parameters<typeof actual.render>[0],
      options: Parameters<typeof actual.render>[1] = {},
    ) => actual.render(ui, { ...options, wrapper: withI18nWrapper(options.wrapper) }),
    renderHook: (
      callback: Parameters<typeof actual.renderHook>[0],
      options: Parameters<typeof actual.renderHook>[1] = {},
    ) => actual.renderHook(callback, { ...options, wrapper: withI18nWrapper(options.wrapper) }),
  };
});

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

function installStorage(name: 'localStorage' | 'sessionStorage', storage: Storage): void {
  Object.defineProperty(globalThis, name, {
    value: storage,
    configurable: true,
    writable: true,
  });

  if (typeof window !== 'undefined') {
    Object.defineProperty(window, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}

function resetStorage(): void {
  installStorage('localStorage', new MemoryStorage());
  installStorage('sessionStorage', new MemoryStorage());
}

function installMatchMedia(): void {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'function') return;

  const createList = (query: string): MediaQueryList => ({
    media: query,
    matches: false,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  } as unknown as MediaQueryList);

  Object.defineProperty(globalThis, 'matchMedia', {
    value: (query: string) => createList(query),
    configurable: true,
    writable: true,
  });

  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => createList(query),
    configurable: true,
    writable: true,
  });
}

function installViewportShim(): void {
  if (typeof window === 'undefined') return;

  const viewport = {
    width: 1280,
    height: 720,
    scale: 1,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    onresize: null,
    onscroll: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
  } as VisualViewport;

  Object.defineProperty(globalThis, 'visualViewport', {
    value: viewport,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(window, 'visualViewport', {
    value: viewport,
    configurable: true,
    writable: true,
  });
}

function installResizeObservers(): void {
  if (typeof globalThis.ResizeObserver !== 'function') {
    class ResizeObserverMock implements ResizeObserver {
      callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element): void {
        this.callback(
          [
            {
              target,
              contentRect: target.getBoundingClientRect(),
            } as ResizeObserverEntry,
          ],
          this,
        );
      }

      unobserve(): void {
        return undefined;
      }

      disconnect(): void {
        return undefined;
      }
    }

    Object.defineProperty(globalThis, 'ResizeObserver', {
      value: ResizeObserverMock,
      configurable: true,
      writable: true,
    });
  }

  if (typeof globalThis.IntersectionObserver !== 'function') {
    class IntersectionObserverMock implements IntersectionObserver {
      root: Element | Document | null = null;
      rootMargin = '0px';
      thresholds: ReadonlyArray<number> = [0];
      callback: IntersectionObserverCallback;

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element): void {
        this.callback(
          [
            {
              target,
              isIntersecting: true,
              intersectionRatio: 1,
              time: performance.now(),
              boundingClientRect: target.getBoundingClientRect(),
              intersectionRect: target.getBoundingClientRect(),
              rootBounds: null,
            } as IntersectionObserverEntry,
          ],
          this,
        );
      }

      unobserve(): void {
        return undefined;
      }

      disconnect(): void {
        return undefined;
      }

      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    Object.defineProperty(globalThis, 'IntersectionObserver', {
      value: IntersectionObserverMock,
      configurable: true,
      writable: true,
    });
  }
}

function installAnimationFrameFallback(): void {
  if (typeof window === 'undefined') return;

  if (typeof window.requestAnimationFrame !== 'function') {
    Object.defineProperty(window, 'requestAnimationFrame', {
      value: (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16),
      configurable: true,
      writable: true,
    });
  }

  if (typeof window.cancelAnimationFrame !== 'function') {
    Object.defineProperty(window, 'cancelAnimationFrame', {
      value: (handle: number) => window.clearTimeout(handle),
      configurable: true,
      writable: true,
    });
  }
}

function installDomHelpers(): void {
  if (typeof window === 'undefined') return;

  if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      value: () => undefined,
      configurable: true,
      writable: true,
    });
  }

  if (typeof window.scrollTo !== 'function') {
    Object.defineProperty(window, 'scrollTo', {
      value: () => undefined,
      configurable: true,
      writable: true,
    });
  }

  if (typeof window.scrollBy !== 'function') {
    Object.defineProperty(window, 'scrollBy', {
      value: () => undefined,
      configurable: true,
      writable: true,
    });
  }

  if (typeof navigator !== 'undefined' && typeof navigator.vibrate !== 'function') {
    Object.defineProperty(navigator, 'vibrate', {
      value: () => false,
      configurable: true,
      writable: true,
    });
  }

  if (typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.getContext !== 'function') {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => ({
        canvas: null,
        clearRect: () => undefined,
        fillRect: () => undefined,
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: () => undefined,
        createImageData: () => ({ data: new Uint8ClampedArray(4) }),
        setTransform: () => undefined,
        drawImage: () => undefined,
        save: () => undefined,
        fillText: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        closePath: () => undefined,
        stroke: () => undefined,
        translate: () => undefined,
        scale: () => undefined,
        rotate: () => undefined,
        arc: () => undefined,
        fill: () => undefined,
        measureText: () => ({ width: 0 } as TextMetrics),
        transform: () => undefined,
        rect: () => undefined,
        clip: () => undefined,
      }),
      configurable: true,
      writable: true,
    });
  }

  if (typeof HTMLDialogElement !== 'undefined') {
    if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
      Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
        value: () => undefined,
        configurable: true,
        writable: true,
      });
    }

    if (typeof HTMLDialogElement.prototype.close !== 'function') {
      Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        value: () => undefined,
        configurable: true,
        writable: true,
      });
    }
  }
}

function installBrowserShims(): void {
  installMatchMedia();
  installViewportShim();
  installResizeObservers();
  installAnimationFrameFallback();
  installDomHelpers();
}

resetStorage();
installBrowserShims();

if (typeof HTMLMediaElement !== 'undefined') {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  });
}