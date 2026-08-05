import { describe, expect, it } from 'vitest'
import { windowsForDisplay } from '../../../src/main/capture/overlay-layout'
import type { DisplayInfo } from '@shared/coords'
import type { WindowRect } from '@shared/window-rect'

const primary: DisplayInfo = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  scaleFactor: 2,
}

const external: DisplayInfo = {
  id: 2,
  bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
}

const windows: readonly WindowRect[] = [
  { id: 10, app: 'OnPrimary', bounds: { x: 100, y: 100, width: 400, height: 300 } },
  { id: 11, app: 'OnExternal', bounds: { x: -1800, y: 50, width: 400, height: 300 } },
  { id: 12, app: 'Offscreen', bounds: { x: 9000, y: 9000, width: 100, height: 100 } },
]

describe('windowsForDisplay', () => {
  it('keeps only windows intersecting the display', () => {
    expect(windowsForDisplay(windows, primary).map((w) => w.id)).toEqual([10])
  })

  it('converts bounds to display-local coordinates', () => {
    expect(windowsForDisplay(windows, external)).toEqual([
      { id: 11, app: 'OnExternal', bounds: { x: 120, y: 50, width: 400, height: 300 } },
    ])
  })

  it('preserves front-to-back order', () => {
    const overlapping: readonly WindowRect[] = [
      { id: 1, app: 'Front', bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { id: 2, app: 'Back', bounds: { x: 0, y: 0, width: 200, height: 200 } },
    ]
    expect(windowsForDisplay(overlapping, primary).map((w) => w.id)).toEqual([1, 2])
  })

  it('returns an empty list when nothing intersects', () => {
    expect(windowsForDisplay([windows[2]!], primary)).toEqual([])
  })
})
