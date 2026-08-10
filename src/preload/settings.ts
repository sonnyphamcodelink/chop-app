import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type ShortcutInfo, type ShortcutUpdate } from '@shared/ipc'

contextBridge.exposeInMainWorld('chopSettings', {
  platform: process.platform,
  getShortcut(): Promise<ShortcutInfo> {
    return ipcRenderer.invoke(CHANNELS.getShortcut) as Promise<ShortcutInfo>
  },
  setShortcut(accelerator: string): Promise<ShortcutUpdate> {
    return ipcRenderer.invoke(CHANNELS.setShortcut, accelerator) as Promise<ShortcutUpdate>
  },
  setRecording(recording: boolean): void {
    ipcRenderer.send(CHANNELS.recordShortcut, recording)
  },
})
