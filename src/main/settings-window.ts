import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { resumeCaptureShortcut } from './hotkeys'

let settings: BrowserWindow | null = null

/** Opens the settings window, or brings the open one forward. */
export function openSettingsWindow(): BrowserWindow {
  if (settings && !settings.isDestroyed()) {
    settings.show()
    settings.focus()
    return settings
  }

  settings = new BrowserWindow({
    width: 460,
    height: 300,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: 'Chop Settings',
    // package.json is "type": "module", so preload is ESM — sandbox must be off.
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/settings.mjs'),
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void settings.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings/index.html`)
  } else {
    void settings.loadFile(join(import.meta.dirname, '../renderer/settings/index.html'))
  }

  settings.once('ready-to-show', () => settings?.show())
  settings.on('closed', () => {
    settings = null
    // Closing mid-recording must not leave Chop without its hotkey.
    resumeCaptureShortcut()
  })

  return settings
}
