import { describe, expect, it } from 'vitest'
import {
  clampRect,
  isDegenerateRect,
  normalizeRect,
  offsetRect,
  rectArea,
  rectContains,
  rectIntersect,
} from '@shared/geometry'

describe('normalizeRect', () => {
  it('builds a positive rect when dragged down-right', () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual({
      x: 10, y: 20, width: 30, height: 40,
    })
  })

  it('builds a positive rect when dragged up-left', () => {
    expect(normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({
      x: 10, y: 20, width: 30, height: 40,
    })
  })

  it('produces a zero-size rect when both corners match', () => {
    expect(normalizeRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      x: 5, y: 5, width: 0, height: 0,
    })
  })
})

describe('rectContains', () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 }

  it('includes points inside', () => {
    expect(rectContains(rect, { x: 50, y: 25 })).toBe(true)
  })

  it('includes the top-left edge', () => {
    expect(rectContains(rect, { x: 0, y: 0 })).toBe(true)
  })

  it('excludes the bottom-right edge', () => {
    expect(rectContains(rect, { x: 100, y: 50 })).toBe(false)
  })

  it('excludes points outside', () => {
    expect(rectContains(rect, { x: -1, y: 25 })).toBe(false)
  })
})

describe('rectIntersect', () => {
  it('returns the overlapping region', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    const b = { x: 50, y: 50, width: 100, height: 100 }
    expect(rectIntersect(a, b)).toEqual({ x: 50, y: 50, width: 50, height: 50 })
  })

  it('returns null when the rects only touch at an edge', () => {
    const a = { x: 0, y: 0, width: 50, height: 50 }
    const b = { x: 50, y: 0, width: 50, height: 50 }
    expect(rectIntersect(a, b)).toBeNull()
  })

  it('returns null when the rects are disjoint', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    const b = { x: 100, y: 100, width: 10, height: 10 }
    expect(rectIntersect(a, b)).toBeNull()
  })
})

describe('clampRect', () => {
  it('leaves a fully contained rect untouched', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rect = { x: 10, y: 10, width: 20, height: 20 }
    expect(clampRect(rect, bounds)).toEqual(rect)
  })

  it('clips a rect overhanging the bottom-right', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rect = { x: 90, y: 90, width: 50, height: 50 }
    expect(clampRect(rect, bounds)).toEqual({ x: 90, y: 90, width: 10, height: 10 })
  })

  it('clips a rect overhanging a negative-origin bounds', () => {
    const bounds = { x: -1920, y: 0, width: 1920, height: 1080 }
    const rect = { x: -2000, y: -50, width: 200, height: 200 }
    expect(clampRect(rect, bounds)).toEqual({ x: -1920, y: 0, width: 120, height: 150 })
  })

  it('collapses a fully outside rect to zero size', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rect = { x: 500, y: 500, width: 10, height: 10 }
    expect(rectArea(clampRect(rect, bounds))).toBe(0)
  })
})

describe('isDegenerateRect', () => {
  it('flags rects thinner than the minimum selection size', () => {
    expect(isDegenerateRect({ x: 0, y: 0, width: 2, height: 100 })).toBe(true)
  })

  it('accepts rects at or above the minimum on both edges', () => {
    expect(isDegenerateRect({ x: 0, y: 0, width: 10, height: 10 })).toBe(false)
  })
})

describe('offsetRect', () => {
  it('moves a rect without mutating the input', () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 }
    expect(offsetRect(rect, 10, 20)).toEqual({ x: 11, y: 22, width: 3, height: 4 })
    expect(rect).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})
