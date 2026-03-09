// src/utils/imageUtils.ts
//
// Image processing utilities for profile photos.
// Resizes an uploaded file to at most MAX_DIMENSION × MAX_DIMENSION and
// compresses it as JPEG.

const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.82;

/**
 * Resize and compress an image File.
 * - Scales down to fit within MAX_DIMENSION × MAX_DIMENSION (preserving aspect ratio).
 * - Encodes as JPEG at JPEG_QUALITY.
 * - Returns the resulting Blob, or throws on failure.
 */
export function resizeAndCompressImage(file: File): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      // Scale down while preserving aspect ratio.
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width >= height) {
          height = Math.round((height / width) * MAX_DIMENSION);
          width = MAX_DIMENSION;
        } else {
          width = Math.round((width / height) * MAX_DIMENSION);
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('canvas.toBlob returned null'));
          }
        },
        'image/jpeg',
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for processing'));
    };

    img.src = objectUrl;
  });
}
