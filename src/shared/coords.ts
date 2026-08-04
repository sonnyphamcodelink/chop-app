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

export function physicalSize(display: DisplayInfo): {
  readonly width: number
  readonly height: number
} {
  return {
    width: Math.round(display.bounds.width * display.scaleFactor),
    height: Math.round(display.bounds.height * display.scaleFactor),
  }
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
