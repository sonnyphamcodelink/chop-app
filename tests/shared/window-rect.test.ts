import { describe, expect, it } from 'vitest'
import {
  filterCapturableWindows,
  type WindowRect,
  windowAtPoint,
} from '@shared/window-rect'

/** Ordered front to back, exactly as the platform providers return them. */
const windows: readonly WindowRect[] = [
  { id: 1, app: 'Front', bounds: { x: 100, y: 100, width: 400, height: 300 } },
  { id: 2, app: 'Behind', bounds: { x: 0, y: 0, width: 800, height: 600 } },
  { id: 3, app: 'External', bounds: { x: -1920, y: 0, width: 600, height: 400 } },
]

describe('windowAtPoint', () => {
  it('returns the front-most window when two overlap', () => {
    expect(windowAtPoint(windows, { x: 200, y: 200 })?.id).toBe(1)
  })

  it('returns the lower window where the front one does not cover', () => {
    expect(windowAtPoint(windows, { x: 50, y: 50 })?.id).toBe(2)
  })

  it('finds a window on a negative-origin display', () => {
    expect(windowAtPoint(windows, { x: -1900, y: 10 })?.id).toBe(3)
  })

  it('returns null when no window contains the point', () => {
    expect(windowAtPoint(windows, { x: 5000, y: 5000 })).toBeNull()
  })

  it('returns null for an empty window list', () => {
    expect(windowAtPoint([], { x: 0, y: 0 })).toBeNull()
  })
})

describe('filterCapturableWindows', () => {
  it('drops windows too small on either edge', () => {
    const input: readonly WindowRect[] = [
      { id: 1, app: 'Real', bounds: { x: 0, y: 0, width: 400, height: 300 } },
      { id: 2, app: 'Sliver', bounds: { x: 0, y: 0, width: 4, height: 300 } },
      { id: 3, app: 'Dot', bounds: { x: 0, y: 0, width: 400, height: 2 } },
    ]
    expect(filterCapturableWindows(input).map((w) => w.id)).toEqual([1])
  })

  it('preserves front-to-back order', () => {
    expect(filterCapturableWindows(windows).map((w) => w.id)).toEqual([1, 2, 3])
  })

  it('does not mutate the input array', () => {
    const input = [...windows]
    filterCapturableWindows(input)
    expect(input).toHaveLength(3)
  })
})
