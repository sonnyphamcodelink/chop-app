import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { CHANNELS, type CaptureResult } from '@shared/ipc'

let editor: BrowserWindow | null = null

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

  editor.on('closed', () => {
    editor = null
  })
  return editor
}

/** Loads a capture into the editor, bringing the existing window forward. */
export function sendCapture(capture: CaptureResult): void {
  const window = getEditorWindow()
  const deliver = (): void => {
    window.webContents.send(CHANNELS.captureReady, capture)
    window.show()
    window.focus()
  }
  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', deliver)
    return
  }
  deliver()
}
