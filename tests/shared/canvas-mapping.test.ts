import { describe, expect, it } from 'vitest'
import { fitScale, viewToImage } from '@shared/canvas-mapping'

describe('fitScale', () => {
  it('shrinks an image larger than the viewport', () => {
    expect(fitScale(2000, 1000, 1000, 1000)).toBe(0.5)
  })

  it('is limited by the tighter axis', () => {
    expect(fitScale(1000, 2000, 1000, 1000)).toBe(0.5)
  })

  it('never upscales a small image', () => {
    expect(fitScale(100, 100, 1000, 1000)).toBe(1)
  })

  it('returns a positive scale for a zero-size viewport', () => {
    expect(fitScale(100, 100, 0, 0)).toBeGreaterThan(0)
  })
})

describe('viewToImage', () => {
  it('divides by the scale', () => {
    expect(viewToImage({ x: 100, y: 50 }, 0.5, null)).toEqual({ x: 200, y: 100 })
  })

  it('adds the crop origin so points land in image coordinates', () => {
    const crop = { x: 300, y: 200, width: 400, height: 300 }
    expect(viewToImage({ x: 50, y: 25 }, 1, crop)).toEqual({ x: 350, y: 225 })
  })

  it('combines scale and crop origin', () => {
    const crop = { x: 100, y: 100, width: 400, height: 300 }
    expect(viewToImage({ x: 50, y: 50 }, 0.5, crop)).toEqual({ x: 200, y: 200 })
  })
})
