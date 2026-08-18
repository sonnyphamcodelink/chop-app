import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS } from '@shared/ipc'
import type { UpdateWindowState } from '@shared/update'

contextBridge.exposeInMainWorld('chopUpdate', {
  cancel(): void {
    ipcRenderer.send(CHANNELS.cancelUpdate)
  },
  onProgress(listener: (state: UpdateWindowState) => void): void {
    ipcRenderer.on(CHANNELS.updateProgress, (_event, state: UpdateWindowState) => listener(state))
  },
})
