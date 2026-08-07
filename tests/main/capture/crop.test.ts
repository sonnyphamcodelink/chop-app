import { describe, expect, it, vi } from 'vitest'

const cropped = { width: 400, height: 200 }
const cropRects: { x: number; y: number; width: number; height: number }[] = []

/** Frame size per fixture data URL: the crop now derives its scale from this. */
const FRAME_SIZES: Record<string, { width: number; height: number }> = {
  'data:full': { width: 3024, height: 1964 },
  'data:external': { width: 1920, height: 1080 },
}

vi.mock('electron', () => ({
  nativeImage: {
    createFromDataURL: (url: string) => ({
      isEmpty: () => url === 'data:empty',
      crop: (rect: { x: number; y: number; width: number; height: number }) => {
        cropRects.push(rect)
        return {
          getSize: () => ({ width: rect.width, height: rect.height }),
          toDataURL: () => 'data:cropped',
        }
      },
      getSize: () => FRAME_SIZES[url] ?? { width: 3024, height: 1964 },
    }),
  },
}))

const { cropCapture } = await import('../../../src/main/capture/crop')

const capture = {
  display: { id: 1, bounds: { x: 0, y: 0, width: 1512, height: 982 }, scaleFactor: 2 },
  dataUrl: 'data:full',
}

describe('cropCapture', () => {
  it('scales a DIP selection to physical pixels before cropping', () => {
    cropRects.length = 0
    const result = cropCapture(capture, {
      displayId: 1,
      rect: { x: 100, y: 50, width: 200, height: 100 },
      source: 'region',
    })
    expect(result).not.toBeNull()
    expect(result?.width).toBe(cropped.width)
    expect(result?.height).toBe(cropped.height)
    expect(result?.dataUrl).toBe('data:cropped')
    expect(result?.scaleFactor).toBe(2)
    expect(cropRects.at(-1)).toEqual({ x: 200, y: 100, width: 400, height: 200 })
  })

  it('treats overlay selections as display-local coordinates', () => {
    cropRects.length = 0
    const externalCapture = {
      display: { id: 2, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
      dataUrl: 'data:external',
    }
    const result = cropCapture(externalCapture, {
      displayId: 2,
      rect: { x: 100, y: 50, width: 200, height: 100 },
      source: 'region',
    })
    expect(result).not.toBeNull()
    expect(cropRects.at(-1)).toEqual({ x: 100, y: 50, width: 200, height: 100 })
  })

  it('assigns an id and an ISO timestamp', () => {
    const result = cropCapture(capture, {
      displayId: 1,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      source: 'window',
    })
    expect(result?.id).toMatch(/\S/)
    expect(() => new Date(result!.createdAt).toISOString()).not.toThrow()
  })

  it('returns null for an empty source image', () => {
    const empty = { ...capture, dataUrl: 'data:empty' }
    expect(
      cropCapture(empty, {
        displayId: 1,
        rect: { x: 0, y: 0, width: 100, height: 100 },
        source: 'region',
      }),
    ).toBeNull()
  })

  it('clamps a selection that exceeds the captured image bounds', () => {
    // 1512 DIP at 2x reports a 3024-wide image; ask for more and the crop must
    // be trimmed rather than requesting pixels that do not exist.
    const result = cropCapture(capture, {
      displayId: 1,
      rect: { x: 1500, y: 0, width: 200, height: 100 },
      source: 'region',
    })
    expect(result).not.toBeNull()
    expect(result!.width).toBeLessThanOrEqual(3024)
  })

  it('returns null for a zero-area selection', () => {
    expect(
      cropCapture(capture, {
        displayId: 1,
        rect: { x: 0, y: 0, width: 0, height: 0 },
        source: 'region',
      }),
    ).toBeNull()
  })
})
