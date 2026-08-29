// src/utils/preload.ts
// Lightweight image preloader with timeout, decode readiness and progress reporting.

/** Default per-image timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 8_000;

export type ImagePreloadStatus = 'loaded' | 'error' | 'timeout';

export type ImagePreloadResult = {
  url: string;
  status: ImagePreloadStatus;
};

/**
 * Preloads and decodes a single image URL.
 *
 * The promise is always fail-open: callers are never trapped by a bad asset.
 * Unlike the previous implementation, timeout/error are reported explicitly
 * instead of being indistinguishable from a genuinely render-ready image.
 */
function preloadOne(url: string, timeoutMs: number): Promise<ImagePreloadResult> {
  return new Promise<ImagePreloadResult>((resolve) => {
    const img = new Image();
    let done = false;

    const finish = (status: ImagePreloadStatus) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve({ url, status });
    };

    const markLoadedAfterDecode = async () => {
      // onload means the bytes arrived, but decode() is the point at which the
      // browser/WebView has pixels ready to paint. Waiting here prevents a
      // later visible avatar from stalling while it is decoded on-screen.
      if (typeof img.decode === 'function') {
        try {
          await img.decode();
        } catch {
          // Some WebViews can reject decode() for an otherwise valid image.
          // If onload completed and dimensions exist, the image is still safe.
          if (!img.complete || img.naturalWidth === 0) {
            finish('error');
            return;
          }
        }
      }
      finish('loaded');
    };

    const timer = window.setTimeout(() => finish('timeout'), timeoutMs);
    img.onload = () => {
      void markLoadedAfterDecode();
    };
    img.onerror = () => finish('error');
    img.src = url;
  });
}

/** Preload one image and report whether it actually became render-ready. */
export function preloadImage(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ImagePreloadResult> {
  return preloadOne(url, timeoutMs);
}

/**
 * Preloads an array of image URLs concurrently.
 *
 * @param urls        - List of image URLs to preload.
 * @param onProgress  - Optional callback called after each image settles.
 *                      Receives `(completed, total, result)`.
 * @param timeoutMs   - Per-image timeout in ms (default 8 000).
 */
export async function preloadImages(
  urls: string[],
  onProgress?: (completed: number, total: number, result: ImagePreloadResult) => void,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ImagePreloadResult[]> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  if (uniqueUrls.length === 0) {
    return [];
  }

  let completed = 0;
  const total = uniqueUrls.length;

  return Promise.all(
    uniqueUrls.map((url) =>
      preloadOne(url, timeoutMs).then((result) => {
        completed += 1;
        onProgress?.(completed, total, result);
        return result;
      }),
    ),
  );
}

/**
 * Alias for preloadImages — callers can await preloadImage(bgUrl) first
 * (background-first ordering) then call preloadAll for remaining assets.
 */
export const preloadAll = preloadImages;
