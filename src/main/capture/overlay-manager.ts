import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { DisplayInfo } from '@shared/coords'
import { CHANNELS, type OverlayInit, type OverlaySelection } from '@shared/ipc'
import type { WindowRect } from '@shared/window-rect'
import type { DisplayCapture } from './capture-service'
import { windowsForDisplay } from './overlay-layout'

export { windowsForDisplay }

function createOverlayWindow(display: DisplayInfo): BrowserWindow {
  const overlay = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    enableLargerThanScreen: true,
    webPreferences: { preload: join(import.meta.dirname, '../preload/overlay.mjs') },
  })

  // 'screen-saver' floats above the menu bar, dock, and fullscreen apps.
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  return overlay
}

function loadOverlay(overlay: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    return overlay.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay/index.html`)
  }
  return overlay.loadFile(join(import.meta.dirname, '../renderer/overlay/index.html'))
}

/**
 * Opens one overlay per display over the frozen screenshots and resolves with the
 * user's selection, or null if they cancelled. Always tears every overlay down.
 */
export async function showOverlays(
  captures: readonly DisplayCapture[],
  windows: readonly WindowRect[],
): Promise<OverlaySelection | null> {
  if (captures.length === 0) return null

  const overlays = captures.map((capture) => ({
    capture,
    window: createOverlayWindow(capture.display),
  }))

  const closeAll = (): void => {
    ipcMain.removeAllListeners(CHANNELS.overlaySelection)
    ipcMain.removeAllListeners(CHANNELS.overlayCancel)
    for (const { window } of overlays) {
      if (!window.isDestroyed()) window.destroy()
    }
  }

  try {
    return await new Promise<OverlaySelection | null>((resolve, reject) => {
      ipcMain.once(CHANNELS.overlaySelection, (_event, selection: OverlaySelection) => {
        resolve(selection)
      })
      ipcMain.once(CHANNELS.overlayCancel, () => resolve(null))

      // allSettled, not all: one display failing must not abort the capture.
      void Promise.allSettled(
        overlays.map(async ({ capture, window }) => {
          await loadOverlay(window)
          const payload: OverlayInit = {
            display: capture.display,
            dataUrl: capture.dataUrl,
            windows: windowsForDisplay(windows, capture.display),
          }
          window.webContents.send(CHANNELS.overlayInit, payload)
          window.show()
          window.focus()
        }),
      ).then((results) => {
        const failures = results.filter((result) => result.status === 'rejected')
        for (const failure of failures) {
          console.warn('An overlay failed to open; continuing on other displays.', failure)
        }
        if (failures.length === overlays.length) reject(new Error('every overlay failed'))
      })
    })
  } finally {
    closeAll()
  }
}
