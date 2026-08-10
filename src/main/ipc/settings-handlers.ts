import { BrowserWindow, ipcMain } from 'electron'
import { formatAccelerator } from '@shared/accelerator'
import { CHANNELS, type LoginItemState, type ShortcutInfo, type ShortcutUpdate } from '@shared/ipc'
import { openAtLoginState, setOpenAtLogin } from '../login-item'
import {
  captureShortcut,
  changeCaptureShortcut,
  resumeCaptureShortcut,
  suspendCaptureShortcut,
} from '../hotkeys'
import { readSettings, writeSettings } from '../settings-store'
import { withCaptureShortcut } from '../settings-file'

/** The shortcut in force, spelled for this platform. */
export function currentShortcut(): ShortcutInfo {
  const accelerator = captureShortcut()
  return { accelerator, display: formatAccelerator(accelerator, process.platform) }
}

function broadcast(shortcut: ShortcutInfo): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(CHANNELS.shortcutChanged, shortcut)
  }
}

/**
 * `onChanged` runs after a shortcut is accepted, so the tray can redraw the
 * accelerator it shows next to Capture.
 */
export function registerSettingsHandlers(onChanged: (shortcut: ShortcutInfo) => void): void {
  ipcMain.handle(CHANNELS.getShortcut, () => currentShortcut())

  ipcMain.handle(CHANNELS.setShortcut, (_event, accelerator: unknown): ShortcutUpdate => {
    if (typeof accelerator !== 'string') {
      return { ok: false, shortcut: currentShortcut(), error: 'That is not a shortcut.' }
    }

    const change = changeCaptureShortcut(accelerator)
    const shortcut = currentShortcut()
    if (!change.ok) return { ok: false, shortcut, error: change.error }

    writeSettings(withCaptureShortcut(readSettings(), change.accelerator))
    broadcast(shortcut)
    onChanged(shortcut)
    return { ok: true, shortcut }
  })

  // The recorder needs the keys the user presses; while it listens the hotkey
  // would otherwise fire a capture instead of being recorded.
  ipcMain.on(CHANNELS.recordShortcut, (_event, recording: unknown) => {
    if (recording === true) suspendCaptureShortcut()
    else resumeCaptureShortcut()
  })

  ipcMain.handle(CHANNELS.getOpenAtLogin, (): LoginItemState => openAtLoginState())

  ipcMain.handle(CHANNELS.setOpenAtLogin, (_event, enabled: unknown): LoginItemState => {
    if (typeof enabled !== 'boolean') return openAtLoginState()
    return setOpenAtLogin(enabled)
  })
}
