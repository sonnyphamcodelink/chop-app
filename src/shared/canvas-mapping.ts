import type { Point, Rect } from './geometry'

/** Largest scale that fits the image in the viewport, never above 1:1. */
export function fitScale(
  imageWidth: number,
  imageHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  if (imageWidth <= 0 || imageHeight <= 0) return 1
  const scale = Math.min(viewWidth / imageWidth, viewHeight / imageHeight, 1)
  return scale > 0 ? scale : 1
}

/** Converts a point in displayed-canvas space to image coordinates. */
export function viewToImage(point: Point, scale: number, cropRect: Rect | null): Point {
  return {
    x: point.x / scale + (cropRect?.x ?? 0),
    y: point.y / scale + (cropRect?.y ?? 0),
  }
}
