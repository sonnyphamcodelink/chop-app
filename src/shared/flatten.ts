import { THUMBNAIL_SIZE } from './constants'
import { type CaptureDocument, outputSize } from './document'
import { type CanvasFactory, renderDocument } from './render'

/** Fits an image inside a THUMBNAIL_SIZE square without upscaling or distorting. */
export function thumbnailSize(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Renders a document to an offscreen canvas at its output size. */
export function flattenDocument(
  image: CanvasImageSource,
  doc: CaptureDocument,
  createCanvas: CanvasFactory,
): CanvasImageSource {
  const size = outputSize(doc)
  const target = createCanvas(size.width, size.height)
  renderDocument(target.ctx, image, doc, createCanvas)
  return target.canvas
}
