import { BrowserWindow, globalShortcut, ipcMain, screen } from 'electron'
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
    acceptFirstMouse: true,
    enableLargerThanScreen: true,
    // package.json is "type": "module", so preload is ESM — sandbox must be off.
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/overlay.mjs'),
      sandbox: false,
    },
  })

  // Keep the overlay above app windows, but below macOS privacy prompts. Using
  // 'screen-saver' can trap the first-run Screen Recording prompt behind Chop.
  overlay.setAlwaysOnTop(true, 'floating')
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
 * One hidden, page-loaded window per display, reused across captures. Building a
 * BrowserWindow and loading its page costs hundreds of milliseconds, so doing it
 * ahead of the hotkey keeps the capture path to a payload send and a `show()`.
 */
const pool = new Map<number, BrowserWindow>()
/** Windows whose overlay page has finished loading and can take an init payload. */
const loaded = new Set<number>()
let warming: Promise<void> | null = null

/** Creates and loads pool windows for every connected display. Idempotent. */
export function warmOverlays(): Promise<void> {
  warming ??= (async () => {
    const displays = screen.getAllDisplays()
    await Promise.allSettled(
      displays.map(async (display) => {
        if (pool.has(display.id)) return
        const overlay = createOverlayWindow({
          id: display.id,
          bounds: display.bounds,
          scaleFactor: display.scaleFactor,
        })
        pool.set(display.id, overlay)
        overlay.on('closed', () => {
          pool.delete(display.id)
          loaded.delete(display.id)
        })
        await loadOverlay(overlay)
        loaded.add(display.id)
      }),
    )
  })()
  return warming
}

/**
 * Opens one overlay per display over the frozen screenshots and resolves with the
 * user's selection, or null if they cancelled. Windows are hidden, not destroyed,
 * so the next capture starts from live pages.
 */
export async function showOverlays(
  captures: readonly DisplayCapture[],
  windows: readonly WindowRect[],
): Promise<OverlaySelection | null> {
  if (captures.length === 0) return null

  // Pages still loading from startup are awaited here, off the hotkey path when
  // the warm finished in time.
  await warmOverlays()

  const displayIds = new Set(captures.map((capture) => capture.display.id))
  // A display was unplugged: its pooled window is dead weight, drop it.
  for (const [id, window] of pool) {
    if (displayIds.has(id)) continue
    pool.delete(id)
    loaded.delete(id)
    if (!window.isDestroyed()) window.destroy()
  }

  const overlays = await Promise.all(
    captures.map(async (capture) => {
      const { display } = capture
      let window = pool.get(display.id)
      if (!window || window.isDestroyed()) {
        // A display was plugged in after the warm: build its window now.
        window = createOverlayWindow(display)
        pool.set(display.id, window)
        window.on('closed', () => {
          pool.delete(display.id)
          loaded.delete(display.id)
        })
      }
      window.setBounds(display.bounds)
      if (!loaded.has(display.id)) {
        await loadOverlay(window)
        loaded.add(display.id)
      }
      return { capture, window }
    }),
  )
  let escapeRegistered = false

  const hideAll = (): void => {
    ipcMain.removeAllListeners(CHANNELS.overlaySelection)
    ipcMain.removeAllListeners(CHANNELS.overlayCancel)
    if (escapeRegistered) globalShortcut.unregister('Escape')
    for (const { window } of overlays) {
      if (!window.isDestroyed()) window.hide()
    }
  }

  try {
    return await new Promise<OverlaySelection | null>((resolve) => {
      ipcMain.once(CHANNELS.overlaySelection, (_event, selection: OverlaySelection) => {
        resolve(selection)
      })
      ipcMain.once(CHANNELS.overlayCancel, () => resolve(null))
      escapeRegistered = globalShortcut.register('Escape', () => resolve(null))
      if (!escapeRegistered) {
        console.warn('Could not register temporary Escape shortcut for capture overlay.')
      }

      for (const { capture, window } of overlays) {
        const payload: OverlayInit = {
          display: capture.display,
          dataUrl: capture.dataUrl,
          windows: windowsForDisplay(windows, capture.display),
        }
        window.webContents.send(CHANNELS.overlayInit, payload)
        window.show()
        window.focus()
      }
    })
  } finally {
    hideAll()
  }
}
