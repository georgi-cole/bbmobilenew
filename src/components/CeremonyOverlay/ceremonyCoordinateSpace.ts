export interface CeremonySurfaceMetrics {
  left: number
  top: number
  width: number
  height: number
  scaleX: number
  scaleY: number
}

export interface CeremonySurfaceRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/**
 * Converts a viewport-relative DOMRect into the overlay surface's local CSS
 * coordinate system. This is intentionally explicit: fixed positioning can
 * acquire a non-viewport containing block in mobile WebViews, and browser zoom
 * or native-shell scaling can make one surface CSS pixel differ from one
 * client-rect pixel.
 */
export function normalizeRectToCeremonySurface(
  rect: DOMRect,
  surface: CeremonySurfaceMetrics
): CeremonySurfaceRect {
  const scaleX = surface.scaleX > 0 ? surface.scaleX : 1
  const scaleY = surface.scaleY > 0 ? surface.scaleY : 1
  const left = (rect.left - surface.left) / scaleX
  const top = (rect.top - surface.top) / scaleY
  const width = rect.width / scaleX
  const height = rect.height / scaleY

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  }
}

export function sameCeremonySurface(
  a: CeremonySurfaceMetrics | null,
  b: CeremonySurfaceMetrics
): boolean {
  if (!a) return false
  return (
    Math.abs(a.left - b.left) < 0.25 &&
    Math.abs(a.top - b.top) < 0.25 &&
    Math.abs(a.width - b.width) < 0.25 &&
    Math.abs(a.height - b.height) < 0.25 &&
    Math.abs(a.scaleX - b.scaleX) < 0.001 &&
    Math.abs(a.scaleY - b.scaleY) < 0.001
  )
}
