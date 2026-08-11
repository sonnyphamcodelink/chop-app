import { contextBridge, ipcRenderer } from 'electron'
import {
  CHANNELS,
  type CaptureResult,
  type SaveRequest,
  type ShortcutInfo,
} from '@shared/ipc'

contextBridge.exposeInMainWorld('chopEditor', {
  onCapture(handler: (capture: CaptureResult) => void): void {
    ipcRenderer.on(CHANNELS.captureReady, (_event, capture: CaptureResult) =>
      handler(capture),
    )
  },
  save(payload: SaveRequest): Promise<void> {
    return ipcRenderer.invoke(CHANNELS.saveCapture, payload) as Promise<void>
  },
  copy(dataUrl: string): void {
    ipcRenderer.send(CHANNELS.copyCapture, dataUrl)
  },
  saveAs(dataUrl: string): Promise<string | null> {
    return ipcRenderer.invoke(CHANNELS.saveCaptureAs, dataUrl) as Promise<string | null>
  },
  listCaptures(): Promise<unknown> {
    return ipcRenderer.invoke(CHANNELS.listCaptures)
  },
  openCapture(id: string): Promise<unknown> {
    return ipcRenderer.invoke(CHANNELS.openCapture, id)
  },
  deleteCapture(id: string): Promise<boolean> {
    return ipcRenderer.invoke(CHANNELS.deleteCapture, id) as Promise<boolean>
  },
  getShortcut(): Promise<ShortcutInfo> {
    return ipcRenderer.invoke(CHANNELS.getShortcut) as Promise<ShortcutInfo>
  },
  onShortcutChanged(handler: (shortcut: ShortcutInfo) => void): void {
    ipcRenderer.on(CHANNELS.shortcutChanged, (_event, shortcut: ShortcutInfo) =>
      handler(shortcut),
    )
  },
})
