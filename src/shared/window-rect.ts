import { MIN_WINDOW_DIMENSION } from './constants'
import { type Point, type Rect, rectContains } from './geometry'

/** A capturable on-screen window in global DIP coordinates. */
export type WindowRect = {
  readonly id: number
  readonly app: string
  readonly bounds: Rect
}

/**
 * Returns the front-most window containing the point. Input must be ordered
 * front to back, which is what both platform providers guarantee.
 */
export function windowAtPoint(
  windows: readonly WindowRect[],
  point: Point,
): WindowRect | null {
  return windows.find((window) => rectContains(window.bounds, point)) ?? null
}

export function filterCapturableWindows(
  windows: readonly WindowRect[],
): readonly WindowRect[] {
  return windows.filter(
    (window) =>
      window.bounds.width >= MIN_WINDOW_DIMENSION &&
      window.bounds.height >= MIN_WINDOW_DIMENSION,
  )
}
