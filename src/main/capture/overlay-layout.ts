import { type DisplayInfo, globalToLocal } from '@shared/coords'
import { rectIntersect } from '@shared/geometry'
import type { WindowRect } from '@shared/window-rect'

/** Windows intersecting this display, converted to display-local DIP coordinates. */
export function windowsForDisplay(
  windows: readonly WindowRect[],
  display: DisplayInfo,
): readonly WindowRect[] {
  return windows.flatMap((window): readonly WindowRect[] => {
    if (!rectIntersect(window.bounds, display.bounds)) return []
    return [{ ...window, bounds: globalToLocal(window.bounds, display) }]
  })
}
