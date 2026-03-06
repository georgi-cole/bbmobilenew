/**
 * waitForTileRect — RAF-based retry helper for tile measurement.
 *
 * Polls for a non-null DOMRect by calling `getTileRect(winnerId)` on each
 * requestAnimationFrame, up to `maxFrames` total attempts.
 * Resolves with the rect if found, or null after exhausting retries.
 */
export function waitForTileRect(
  getTileRect: (id: string) => DOMRect | null,
  winnerId: string,
  maxFrames = 6,
): Promise<DOMRect | null> {
  return new Promise((resolve) => {
    let frames = 0;
    function attempt() {
      frames++;
      const rect = getTileRect(winnerId);
      if (rect || frames >= maxFrames) {
        resolve(rect);
        return;
      }
      requestAnimationFrame(attempt);
    }
    requestAnimationFrame(attempt);
  });
}
