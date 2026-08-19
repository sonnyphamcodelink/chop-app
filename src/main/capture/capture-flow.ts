import type { CaptureResult } from '@shared/ipc'
import { listCapturableWindows, resolveWindowProvider } from '../window-providers/index'
import { captureAllDisplays } from './capture-service'
import { cropCapture } from './crop'
import { showOverlays } from './overlay-manager'
import { recordUsage } from '../usage/usage-store'

let inFlight = false

/**
 * The full capture pipeline. Guarded against re-entry so a repeated hotkey press
 * cannot stack overlays on top of each other.
 *
 * Increments the `captures` usage counter on every non-null return — a
 * cancelled overlay does not count. Counting is unconditional so the capture
 * path stays clean of settings checks.
 */
export async function runCaptureFlow(): Promise<CaptureResult | null> {
  if (inFlight) return null
  inFlight = true
  try {
    // The window list is independent of the screenshots, so grab both at once.
    const [captures, windows] = await Promise.all([
      captureAllDisplays(),
      listCapturableWindows(resolveWindowProvider()),
    ])
    if (captures.length === 0) return null

    const selection = await showOverlays(captures, windows)
    if (!selection) return null

    const capture = captures.find((item) => item.display.id === selection.displayId)
    if (!capture) {
      console.warn(`Selection referenced unknown display ${selection.displayId}.`)
      return null
    }

    const result = cropCapture(capture, selection)
    if (result) recordUsage('captures')
    return result
  } catch (error) {
    console.error('Capture failed.', error)
    return null
  } finally {
    inFlight = false
  }
}
