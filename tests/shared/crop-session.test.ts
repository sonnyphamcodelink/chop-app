import { describe, expect, it } from 'vitest'
import { createDocument, setCrop } from '@shared/document'
import {
  constrainCropRect,
  cropBounds,
  fullImageRect,
  initialCropRect,
  moveCropRect,
} from '@shared/crop-session'

const doc = createDocument('d', 800, 600)
const bounds = { x: 0, y: 0, width: 800, height: 600 }

describe('fullImageRect / initialCropRect', () => {
  it('uses the full document when there is no crop', () => {
    expect(fullImageRect(doc)).toEqual(bounds)
    expect(initialCropRect(doc)).toEqual(bounds)
  })

  it('starts from the committed crop when present', () => {
    const cropped = setCrop(doc, { x: 10, y: 20, width: 100, height: 80 })
    expect(initialCropRect(cropped)).toEqual({ x: 10, y: 20, width: 100, height: 80 })
    expect(fullImageRect(cropped)).toEqual(bounds)
  })
})

describe('cropBounds', () => {
  const cropped = setCrop(doc, { x: 10, y: 20, width: 100, height: 80 })

  it('gives reframing the whole capture, so a crop can be pushed back out', () => {
    expect(cropBounds(cropped, 'reframe')).toEqual(bounds)
  })

  it('holds trimming to the cropped view it is drawn over', () => {
    expect(cropBounds(cropped, 'trim')).toEqual({ x: 10, y: 20, width: 100, height: 80 })
  })

  it('is the whole capture either way when nothing is cropped yet', () => {
    expect(cropBounds(doc, 'reframe')).toEqual(bounds)
    expect(cropBounds(doc, 'trim')).toEqual(bounds)
  })
})

describe('constrainCropRect', () => {
  it('clamps to bounds and enforces the minimum size', () => {
    expect(constrainCropRect({ x: -10, y: -10, width: 50, height: 50 }, bounds)).toEqual({
      x: 0, y: 0, width: 50, height: 50,
    })
    expect(constrainCropRect({ x: 0, y: 0, width: 1, height: 1 }, bounds)).toEqual({
      x: 0, y: 0, width: 4, height: 4,
    })
  })

  it('keeps a oversized rect inside the image', () => {
    expect(constrainCropRect({ x: 700, y: 500, width: 200, height: 200 }, bounds)).toEqual({
      x: 600, y: 400, width: 200, height: 200,
    })
  })

  it('snaps a fractional rect to whole image pixels', () => {
    // Pointer positions divided by the view scale are fractional; a crop kept at
    // sub-pixel precision resamples the whole screenshot on export.
    expect(
      constrainCropRect({ x: 137.4, y: 50.6, width: 299.2, height: 200.8 }, bounds),
    ).toEqual({ x: 137, y: 51, width: 299, height: 201 })
  })

  it('produces whole pixels from every fractional drag offset', () => {
    for (const offset of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const rect = constrainCropRect(
        { x: 10 + offset, y: 20 + offset, width: 100 + offset, height: 80 + offset },
        bounds,
      )
      expect(Number.isInteger(rect.x)).toBe(true)
      expect(Number.isInteger(rect.y)).toBe(true)
      expect(Number.isInteger(rect.width)).toBe(true)
      expect(Number.isInteger(rect.height)).toBe(true)
    }
  })
})

describe('moveCropRect', () => {
  it('offsets then clamps so the frame stays inside the image', () => {
    const rect = { x: 10, y: 10, width: 100, height: 80 }
    expect(moveCropRect(rect, -50, -50, bounds)).toEqual({
      x: 0, y: 0, width: 100, height: 80,
    })
    expect(moveCropRect(rect, 1000, 1000, bounds)).toEqual({
      x: 700, y: 520, width: 100, height: 80,
    })
  })
})
