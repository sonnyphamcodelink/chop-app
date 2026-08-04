import { describe, expect, it } from 'vitest'
import {
  type DisplayInfo,
  dipToPhysical,
  displayForPoint,
  globalToLocal,
  localToGlobal,
  physicalSize,
  selectionToPhysical,
} from '@shared/coords'

const primary: DisplayInfo = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  scaleFactor: 2,
}

/** A 1× monitor positioned to the LEFT of the primary — negative origin. */
const leftExternal: DisplayInfo = {
  id: 2,
  bounds: { x: -1920, y: -100, width: 1920, height: 1080 },
  scaleFactor: 1,
}

describe('globalToLocal', () => {
  it('is an identity on a display anchored at the origin', () => {
    const rect = { x: 100, y: 50, width: 200, height: 100 }
    expect(globalToLocal(rect, primary)).toEqual(rect)
  })

  it('subtracts a negative display origin', () => {
    const rect = { x: -1820, y: 0, width: 200, height: 100 }
    expect(globalToLocal(rect, leftExternal)).toEqual({
      x: 100, y: 100, width: 200, height: 100,
    })
  })
})

describe('localToGlobal', () => {
  it('round-trips with globalToLocal on a negative-origin display', () => {
    const rect = { x: -1820, y: 0, width: 200, height: 100 }
    expect(localToGlobal(globalToLocal(rect, leftExternal), leftExternal)).toEqual(rect)
  })
})

describe('dipToPhysical', () => {
  it('doubles coordinates on a 2x display', () => {
    expect(dipToPhysical({ x: 10, y: 20, width: 30, height: 40 }, 2)).toEqual({
      x: 20, y: 40, width: 60, height: 80,
    })
  })

  it('is an identity at 1x', () => {
    const rect = { x: 10, y: 20, width: 30, height: 40 }
    expect(dipToPhysical(rect, 1)).toEqual(rect)
  })

  it('rounds outward so no selected pixel is lost', () => {
    // Span [10.6, 40.7) covers pixel indices 10–40 (31 pixels)
    // Span [20.6, 60.7) covers pixel indices 20–60 (41 pixels)
    expect(dipToPhysical({ x: 10.6, y: 20.6, width: 30.1, height: 40.1 }, 1)).toEqual({
      x: 10, y: 20, width: 31, height: 41,
    })
  })

  it('handles fractional scale factors', () => {
    expect(dipToPhysical({ x: 0, y: 0, width: 100, height: 100 }, 1.5)).toEqual({
      x: 0, y: 0, width: 150, height: 150,
    })
  })
})

describe('physicalSize', () => {
  it('multiplies display bounds by the scale factor', () => {
    expect(physicalSize(primary)).toEqual({ width: 3024, height: 1964 })
  })
})

describe('displayForPoint', () => {
  const displays = [primary, leftExternal]

  it('finds the primary display', () => {
    expect(displayForPoint(displays, { x: 10, y: 10 })?.id).toBe(1)
  })

  it('finds a display at negative coordinates', () => {
    expect(displayForPoint(displays, { x: -1000, y: 0 })?.id).toBe(2)
  })

  it('returns null for a point in no display', () => {
    expect(displayForPoint(displays, { x: 99999, y: 99999 })).toBeNull()
  })
})

describe('selectionToPhysical', () => {
  it('converts a global 2x selection to physical pixels', () => {
    const selection = { x: 100, y: 50, width: 200, height: 100 }
    expect(selectionToPhysical(selection, primary)).toEqual({
      x: 200, y: 100, width: 400, height: 200,
    })
  })

  it('converts a selection on a negative-origin 1x display', () => {
    const selection = { x: -1820, y: 0, width: 200, height: 100 }
    expect(selectionToPhysical(selection, leftExternal)).toEqual({
      x: 100, y: 100, width: 200, height: 100,
    })
  })

  it('clamps a selection overhanging the display edge before scaling', () => {
    const selection = { x: 1400, y: 900, width: 400, height: 400 }
    expect(selectionToPhysical(selection, primary)).toEqual({
      x: 2800, y: 1800, width: 224, height: 164,
    })
  })
})
