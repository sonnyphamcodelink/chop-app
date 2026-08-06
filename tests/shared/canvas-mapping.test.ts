import { describe, expect, it } from 'vitest'
import { backingScale, fitScale, imageToView, viewToImage } from '@shared/canvas-mapping'

describe('fitScale', () => {
  it('shrinks an image larger than the viewport', () => {
    expect(fitScale(2000, 1000, 1000, 1000)).toBe(0.5)
  })

  it('is limited by the tighter axis', () => {
    expect(fitScale(1000, 2000, 1000, 1000)).toBe(0.5)
  })

  it('never upscales a small image above on-screen 1:1', () => {
    expect(fitScale(100, 100, 1000, 1000)).toBe(1)
  })

  it('caps at DIP size so a Retina capture is not shown zoomed in', () => {
    // 400×200 physical pixels from a 2× display were 200×100 DIPs on screen.
    expect(fitScale(400, 200, 1000, 1000, 2)).toBe(0.5)
  })

  it('still shrinks when the DIP-sized image exceeds the viewport', () => {
    expect(fitScale(4000, 2000, 1000, 1000, 2)).toBe(0.25)
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

describe('imageToView', () => {
  it('inverts viewToImage, crop origin included', () => {
    const crop = { x: 100, y: 100, width: 400, height: 300 }
    const view = { x: 50, y: 50 }
    expect(imageToView(viewToImage(view, 0.5, crop), 0.5, crop)).toEqual(view)
  })

  it('multiplies by the scale when there is no crop', () => {
    expect(imageToView({ x: 200, y: 100 }, 0.5, null)).toEqual({ x: 100, y: 50 })
  })
})

describe('backingScale', () => {
  it('multiplies display scale by device pixel ratio for a sharp Retina canvas', () => {
    // DIP display scale 0.5 on a 2× editor → 1 buffer pixel per image pixel.
    expect(backingScale(0.5, 2)).toBe(1)
  })

  it('keeps a 1× display at the display scale', () => {
    expect(backingScale(0.5, 1)).toBe(0.5)
  })

  it('treats a missing device pixel ratio as 1', () => {
    expect(backingScale(0.5, 0)).toBe(0.5)
  })
})
