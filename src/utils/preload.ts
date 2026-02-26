// src/utils/preload.ts
// Lightweight image preloader with timeout and progress callback.

/** Default per-image timeout in milliseconds. */
const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Preloads a single image URL.
 * Resolves when the image loads or the timeout elapses (treats timeout as done
 * so UX never stalls indefinitely).
 */
function preloadOne(url: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    img.onload = finish;
    img.onerror = finish; // treat errors as done — non-blocking
    img.src = url;
  });
}

/**
 * Preloads an array of image URLs concurrently.
 *
 * @param urls        - List of image URLs to preload.
 * @param onProgress  - Optional callback called after each image completes.
 *                      Receives `(loaded: number, total: number)`.
 * @param timeoutMs   - Per-image timeout in ms (default 8 000). Timed-out
 *                      images are treated as loaded so progress never stalls.
 */
export async function preloadImages(
  urls: string[],
  onProgress?: (loaded: number, total: number) => void,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  if (urls.length === 0) {
    onProgress?.(0, 0);
    return;
  }

  let loaded = 0;
  const total = urls.length;

  await Promise.all(
    urls.map((url) =>
      preloadOne(url, timeoutMs).then(() => {
        loaded += 1;
        onProgress?.(loaded, total);
      }),
    ),
  );
}
