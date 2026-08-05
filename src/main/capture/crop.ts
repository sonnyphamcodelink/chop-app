import { nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { selectionToPhysical } from '@shared/coords'
import { clampRect, rectArea } from '@shared/geometry'
import type { CaptureResult, OverlaySelection } from '@shared/ipc'
import type { DisplayCapture } from './capture-service'

/** Crops the frozen full-resolution image to the user's selection. */
export function cropCapture(
  capture: DisplayCapture,
  selection: OverlaySelection,
): CaptureResult | null {
  const image = nativeImage.createFromDataURL(capture.dataUrl)
  if (image.isEmpty()) {
    console.warn('Frozen capture image was empty; nothing to crop.')
    return null
  }

  // The captured image's own size is authoritative — our arithmetic is not.
  // Clamping here means a rounding disagreement can never ask for pixels that
  // do not exist, which matters at fractional display scale factors.
  const imageSize = image.getSize()
  const imageBounds = { x: 0, y: 0, width: imageSize.width, height: imageSize.height }
  const physical = clampRect(selectionToPhysical(selection.rect, capture.display), imageBounds)
  if (rectArea(physical) === 0) return null

  const output = image.crop(physical)
  const outputSize = output.getSize()
  return {
    id: randomUUID(),
    dataUrl: output.toDataURL(),
    width: outputSize.width,
    height: outputSize.height,
    createdAt: new Date().toISOString(),
  }
}
