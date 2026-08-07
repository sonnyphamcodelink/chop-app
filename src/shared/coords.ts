import { clampRect, type Point, type Rect, rectContains } from './geometry'

export type DisplayInfo = {
  readonly id: number
  /** Position and size in global device-independent pixels. May have a negative origin. */
  readonly bounds: Rect
  readonly scaleFactor: number
}

export function globalToLocal(rect: Rect, display: DisplayInfo): Rect {
  return { ...rect, x: rect.x - display.bounds.x, y: rect.y - display.bounds.y }
}

export function localToGlobal(rect: Rect, display: DisplayInfo): Rect {
  return { ...rect, x: rect.x + display.bounds.x, y: rect.y + display.bounds.y }
}

/**
 * Scales device-independent pixels to physical pixels, rounding outward so a
 * selection never loses a pixel it visually covered.
 */
export function dipToPhysical(rect: Rect, scaleFactor: number): Rect {
  const left = Math.floor(rect.x * scaleFactor)
  const top = Math.floor(rect.y * scaleFactor)
  const right = Math.ceil((rect.x + rect.width) * scaleFactor)
  const bottom = Math.ceil((rect.y + rect.height) * scaleFactor)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export type PixelSize = { readonly width: number; readonly height: number }

/**
 * The framebuffer size a display is actually rendered at.
 *
 * Rounds to nearest, because this size is handed to the capturer as the exact
 * frame to produce. Asking for even one pixel more than the real framebuffer
 * makes the capturer rescale the whole screenshot to fit, which resamples every
 * glyph on screen — the difference between crisp text and soft text. Crop
 * arithmetic must not lean on this value being an upper bound; `dipRectToImage`
 * derives its scale from the captured image itself instead.
 */
export function physicalSize(display: DisplayInfo): PixelSize {
  return {
    width: Math.round(display.bounds.width * display.scaleFactor),
    height: Math.round(display.bounds.height * display.scaleFactor),
  }
}

/**
 * Maps a display-local DIP rect onto a captured image's own pixel grid.
 *
 * The image's size is the only authoritative statement of what was captured, so
 * the scale comes from it rather than from `scaleFactor`. A capturer that hands
 * back a frame even slightly off the expected size then still crops the right
 * pixels, instead of drifting further from the selection the further right it
 * goes. Rounds outward, so a selection never loses a pixel it visually covered.
 */
export function dipRectToImage(rect: Rect, boundsDip: PixelSize, image: PixelSize): Rect {
  const scaleX = boundsDip.width > 0 ? image.width / boundsDip.width : 1
  const scaleY = boundsDip.height > 0 ? image.height / boundsDip.height : 1
  const left = Math.max(0, Math.floor(rect.x * scaleX))
  const top = Math.max(0, Math.floor(rect.y * scaleY))
  // Capped at the frame: rounding outward on a ratio that is a hair over exact
  // would otherwise ask for a column of pixels one past the end of the image.
  const right = Math.min(image.width, Math.ceil((rect.x + rect.width) * scaleX))
  const bottom = Math.min(image.height, Math.ceil((rect.y + rect.height) * scaleY))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function displayForPoint(
  displays: readonly DisplayInfo[],
  point: Point,
): DisplayInfo | null {
  return displays.find((display) => rectContains(display.bounds, point)) ?? null
}

/**
 * Full conversion pipeline for a capture selection: global DIP coordinates to
 * physical pixel coordinates within the given display's captured image.
 */
export function selectionToPhysical(rectGlobalDip: Rect, display: DisplayInfo): Rect {
  const local = globalToLocal(rectGlobalDip, display)
  const localBounds = { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height }
  return dipToPhysical(clampRect(local, localBounds), display.scaleFactor)
}
