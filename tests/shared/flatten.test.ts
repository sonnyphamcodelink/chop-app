import { describe, expect, it } from 'vitest'
import { THUMBNAIL_SIZE } from '@shared/constants'
import { createDocument, setCrop } from '@shared/document'
import { flattenDocument, thumbnailSize } from '@shared/flatten'
import type { CanvasFactory } from '@shared/render'
import { createMockContext } from '../helpers/mock-context'

function trackingFactory(): { readonly factory: CanvasFactory; readonly sizes: number[][] } {
  const sizes: number[][] = []
  const factory: CanvasFactory = (width, height) => {
    sizes.push([width, height])
    return { canvas: {} as CanvasImageSource, ctx: createMockContext().ctx }
  }
  return { factory, sizes }
}

describe('thumbnailSize', () => {
  it('scales a landscape image to fit the long edge', () => {
    expect(thumbnailSize(1000, 500)).toEqual({
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE / 2,
    })
  })

  it('scales a portrait image to fit the long edge', () => {
    expect(thumbnailSize(500, 1000)).toEqual({
      width: THUMBNAIL_SIZE / 2,
      height: THUMBNAIL_SIZE,
    })
  })

  it('never upscales an already small image', () => {
    expect(thumbnailSize(64, 32)).toEqual({ width: 64, height: 32 })
  })

  it('never returns a zero dimension', () => {
    const size = thumbnailSize(1000, 1)
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)
  })
})

describe('flattenDocument', () => {
  it('allocates a canvas at the document size when uncropped', () => {
    const { factory, sizes } = trackingFactory()
    flattenDocument({} as CanvasImageSource, createDocument('d', 800, 600), factory)
    expect(sizes[0]).toEqual([800, 600])
  })

  it('allocates a canvas at the crop size when cropped', () => {
    const { factory, sizes } = trackingFactory()
    const doc = setCrop(createDocument('d', 800, 600), {
      x: 100, y: 100, width: 300, height: 200,
    })
    flattenDocument({} as CanvasImageSource, doc, factory)
    expect(sizes[0]).toEqual([300, 200])
  })
})
