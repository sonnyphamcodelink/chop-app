import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createEditorWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: { preload: join(import.meta.dirname, '../preload/editor.mjs') },
  })
  window.once('ready-to-show', () => window.show())
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/editor/index.html`)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/editor/index.html'))
  }
  return window
}

void app.whenReady().then(() => {
  createEditorWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createEditorWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
