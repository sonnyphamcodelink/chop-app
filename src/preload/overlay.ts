import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type OverlayInit, type OverlaySelection } from '@shared/ipc'

contextBridge.exposeInMainWorld('chopOverlay', {
  onInit(handler: (init: OverlayInit) => void): void {
    ipcRenderer.on(CHANNELS.overlayInit, (_event, init: OverlayInit) => handler(init))
  },
  select(selection: OverlaySelection): void {
    ipcRenderer.send(CHANNELS.overlaySelection, selection)
  },
  cancel(): void {
    ipcRenderer.send(CHANNELS.overlayCancel)
  },
})
