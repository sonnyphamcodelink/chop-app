import type { CaptureResult } from '@shared/ipc'
import { listCapturableWindows, resolveWindowProvider } from '../window-providers/index'
import { captureAllDisplays } from './capture-service'
import { cropCapture } from './crop'
import { showOverlays } from './overlay-manager'

let inFlight = false

/**
 * The full capture pipeline. Guarded against re-entry so a repeated hotkey press
 * cannot stack overlays on top of each other.
 */
export async function runCaptureFlow(): Promise<CaptureResult | null> {
  if (inFlight) return null
  inFlight = true
  try {
    const captures = await captureAllDisplays()
    if (captures.length === 0) return null

    const windows = await listCapturableWindows(resolveWindowProvider())
    const selection = await showOverlays(captures, windows)
    if (!selection) return null

    const capture = captures.find((item) => item.display.id === selection.displayId)
    if (!capture) {
      console.warn(`Selection referenced unknown display ${selection.displayId}.`)
      return null
    }
    return cropCapture(capture, selection)
  } catch (error) {
    console.error('Capture failed.', error)
    return null
  } finally {
    inFlight = false
  }
}
