import type { Point, Rect } from './geometry'

/**
 * Largest scale that fits the image in the viewport, never above on-screen 1:1.
 * `scaleFactor` is the display scale at capture time (2 on Retina). Captures are
 * physical pixels; capping at `1 / scaleFactor` keeps the editor at DIP size.
 */
export function fitScale(
  imageWidth: number,
  imageHeight: number,
  viewWidth: number,
  viewHeight: number,
  scaleFactor = 1,
): number {
  if (imageWidth <= 0 || imageHeight <= 0) return 1
  const maxScale = scaleFactor > 0 ? 1 / scaleFactor : 1
  const scale = Math.min(viewWidth / imageWidth, viewHeight / imageHeight, maxScale)
  return scale > 0 ? scale : maxScale
}

/**
 * Canvas buffer pixels per image pixel. CSS size stays at `displayScale`; the
 * backing store is multiplied by devicePixelRatio so Retina editors stay sharp.
 */
export function backingScale(displayScale: number, devicePixelRatio: number): number {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1
  return displayScale * dpr
}

/** Converts a point in displayed-canvas space to image coordinates. */
export function viewToImage(point: Point, scale: number, cropRect: Rect | null): Point {
  return {
    x: point.x / scale + (cropRect?.x ?? 0),
    y: point.y / scale + (cropRect?.y ?? 0),
  }
}
