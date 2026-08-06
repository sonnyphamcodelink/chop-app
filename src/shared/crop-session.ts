import { MIN_SELECTION_DIMENSION } from './constants'
import type { CaptureDocument } from './document'
import type { Rect } from './geometry'

export function fullImageRect(doc: CaptureDocument): Rect {
  return { x: 0, y: 0, width: doc.width, height: doc.height }
}

export function initialCropRect(doc: CaptureDocument): Rect {
  return doc.cropRect ?? fullImageRect(doc)
}

/**
 * Clamp into bounds and enforce MIN_SELECTION_DIMENSION on both edges.
 *
 * The result is snapped to whole image pixels. Pointer positions divided by the
 * view scale are fractional, and a crop origin of x=137.4 makes the export draw
 * the screenshot half a pixel off the grid — which resamples the entire image
 * and softens every glyph in it. Rounding here costs sub-pixel precision the
 * user cannot aim at anyway.
 */
export function constrainCropRect(rect: Rect, bounds: Rect): Rect {
  const min = MIN_SELECTION_DIMENSION
  const width = Math.min(Math.max(Math.round(rect.width), min), bounds.width)
  const height = Math.min(Math.max(Math.round(rect.height), min), bounds.height)
  const maxX = bounds.x + bounds.width - width
  const maxY = bounds.y + bounds.height - height
  return {
    x: Math.min(Math.max(Math.round(rect.x), bounds.x), maxX),
    y: Math.min(Math.max(Math.round(rect.y), bounds.y), maxY),
    width,
    height,
  }
}

export function moveCropRect(rect: Rect, dx: number, dy: number, bounds: Rect): Rect {
  return constrainCropRect(
    { ...rect, x: rect.x + dx, y: rect.y + dy },
    bounds,
  )
}
