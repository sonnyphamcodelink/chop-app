import { describe, expect, it } from 'vitest'
import { rectFromFrameBounds } from '../../../src/main/window-providers/windows'

/** A Win32 RECT is four 32-bit signed ints: left, top, right, bottom. */
function rect(left: number, top: number, right: number, bottom: number): Buffer {
  const buffer = Buffer.alloc(16)
  buffer.writeInt32LE(left, 0)
  buffer.writeInt32LE(top, 4)
  buffer.writeInt32LE(right, 8)
  buffer.writeInt32LE(bottom, 12)
  return buffer
}

describe('rectFromFrameBounds', () => {
  it('converts left/top/right/bottom into x/y/width/height', () => {
    expect(rectFromFrameBounds(rect(100, 50, 900, 650), 7, 'Notepad')).toEqual({
      id: 7,
      app: 'Notepad',
      bounds: { x: 100, y: 50, width: 800, height: 600 },
    })
  })

  it('handles a window on a monitor left of the primary', () => {
    expect(rectFromFrameBounds(rect(-1920, 0, -1520, 300), 8, 'Explorer').bounds).toEqual({
      x: -1920, y: 0, width: 400, height: 300,
    })
  })

  it('produces zero dimensions for an inverted rect rather than negatives', () => {
    const bounds = rectFromFrameBounds(rect(500, 500, 100, 100), 9, 'Ghost').bounds
    expect(bounds.width).toBe(0)
    expect(bounds.height).toBe(0)
  })
})
