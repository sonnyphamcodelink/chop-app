import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { CHANNELS } from '@shared/ipc'
import type { UpdateWindowState } from '@shared/update'

export type UpdateWindowController = {
  readonly send: (state: UpdateWindowState) => void
  /** Lets the app quit once the detached replacement helper is ready. */
  readonly allowAppQuit: () => void
}

export function openUpdateWindow(tag: string, onCancel: () => void): UpdateWindowController {
  const window = new BrowserWindow({
    width: 440,
    height: 190,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: `Updating Chop ${tag}`,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/update.mjs'),
      sandbox: false,
    },
  })

  let latest: UpdateWindowState = {
    phase: 'downloading',
    tag,
    received: 0,
    total: 1,
    percent: 0,
  }
  let loaded = false
  let cancellable = true
  let appIsQuitting = false

  const send = (state: UpdateWindowState): void => {
    latest = state
    cancellable = state.phase !== 'preparing'
    if (!window.isDestroyed() && loaded) window.webContents.send(CHANNELS.updateProgress, state)
    if (!window.isDestroyed()) {
      window.setProgressBar(state.phase === 'downloading' ? state.percent / 100 : -1)
    }
  }

  window.webContents.once('did-finish-load', () => {
    loaded = true
    window.webContents.send(CHANNELS.updateProgress, latest)
  })
  window.once('ready-to-show', () => window.show())
  window.on('close', (event) => {
    if (appIsQuitting) return
    if (!cancellable) {
      event.preventDefault()
      return
    }
    onCancel()
  })

  const cancelListener = (event: Electron.IpcMainEvent): void => {
    if (event.sender !== window.webContents || window.isDestroyed()) return
    window.close()
  }
  ipcMain.on(CHANNELS.cancelUpdate, cancelListener)
  window.once('closed', () => ipcMain.off(CHANNELS.cancelUpdate, cancelListener))

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/update/index.html`)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/update/index.html'))
  }

  return {
    send,
    allowAppQuit: () => {
      appIsQuitting = true
    },
  }
}
