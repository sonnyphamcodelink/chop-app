import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { CHANNELS, type SettingsPane } from '@shared/ipc'
import { resumeCaptureShortcut } from './hotkeys'

let settings: BrowserWindow | null = null

function showPane(window: BrowserWindow, pane: SettingsPane | undefined): void {
  if (!pane) return
  window.webContents.send(CHANNELS.showSettingsPane, pane)
}

/**
 * Opens the settings window, or brings the open one forward. `pane` selects a
 * sidebar item, so a refused capture can land the user on License.
 */
export function openSettingsWindow(pane?: SettingsPane): BrowserWindow {
  if (settings && !settings.isDestroyed()) {
    settings.show()
    settings.focus()
    showPane(settings, pane)
    return settings
  }

  settings = new BrowserWindow({
    width: 600,
    // Tall enough for the License pane, which is the longest of the three.
    height: 460,
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
  // The renderer only has listeners once its bundle has run, so the pane is
  // asked for after the load finishes rather than on ready-to-show.
  settings.webContents.once('did-finish-load', () => {
    if (settings && !settings.isDestroyed()) showPane(settings, pane)
  })
  settings.on('closed', () => {
    settings = null
    // Closing mid-recording must not leave Chop without its hotkey.
    resumeCaptureShortcut()
  })

  return settings
}
