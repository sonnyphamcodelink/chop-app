import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { CHANNELS, type CaptureResult } from '@shared/ipc'

let editor: BrowserWindow | null = null
let quitting = false

app.on('before-quit', () => {
  quitting = true
})

/** One editor window for the whole app, created on demand and reused. */
export function getEditorWindow(): BrowserWindow {
  if (editor && !editor.isDestroyed()) return editor

  editor = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    title: 'Chop',
    // package.json is "type": "module", so preload is ESM — sandbox must be off.
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/editor.mjs'),
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void editor.loadURL(`${process.env.ELECTRON_RENDERER_URL}/editor/index.html`)
  } else {
    void editor.loadFile(join(import.meta.dirname, '../renderer/editor/index.html'))
  }

  editor.on('close', (event) => {
    // The red close button behaves like a normal macOS app: it dismisses the
    // editor while leaving Chop available in the Dock and menu bar. A real
    // application quit must still be allowed to close the window.
    if (process.platform === 'darwin' && !quitting) {
      event.preventDefault()
      editor?.hide()
    }
  })
  editor.on('closed', () => {
    editor = null
  })
  return editor
}

/** Brings the editor back from the Dock, tray, or a second launch. */
export function showEditorWindow(): void {
  const window = getEditorWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

/** Loads a capture into the editor, bringing the existing window forward. */
export function sendCapture(capture: CaptureResult): void {
  const window = getEditorWindow()
  const deliver = (): void => {
    window.webContents.send(CHANNELS.captureReady, capture)
    showEditorWindow()
  }
  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', deliver)
    return
  }
  deliver()
}
