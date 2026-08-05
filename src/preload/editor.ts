import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type CaptureResult, type SaveRequest } from '@shared/ipc'

contextBridge.exposeInMainWorld('chopEditor', {
  onCapture(handler: (capture: CaptureResult) => void): void {
    ipcRenderer.on(CHANNELS.captureReady, (_event, capture: CaptureResult) =>
      handler(capture),
    )
  },
  save(payload: SaveRequest): void {
    ipcRenderer.send(CHANNELS.saveCapture, payload)
  },
  copy(dataUrl: string): void {
    ipcRenderer.send(CHANNELS.copyCapture, dataUrl)
  },
  listCaptures(): Promise<unknown> {
    return ipcRenderer.invoke(CHANNELS.listCaptures)
  },
  openCapture(id: string): Promise<unknown> {
    return ipcRenderer.invoke(CHANNELS.openCapture, id)
  },
})
