import { app, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'node:path'
import { captureAccelerator } from './hotkey-accelerator'

export type TrayHandlers = {
  onCapture(): void
  onOpenEditor(): void
  captureRoot(): string
}

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray-icon.png')
    : join(app.getAppPath(), 'resources', 'tray-icon.png')
}

export function createTray(handlers: TrayHandlers): Tray {
  const icon = nativeImage.createFromPath(iconPath())
  // A template image adapts to light and dark menu bars on macOS.
  icon.setTemplateImage(true)

  const tray = new Tray(icon)
  tray.setToolTip('Chop')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Capture', accelerator: captureAccelerator(), click: handlers.onCapture },
      { label: 'Open Editor', click: handlers.onOpenEditor },
      { type: 'separator' },
      {
        label: 'Open Captures Folder',
        click: () => void shell.openPath(handlers.captureRoot()),
      },
      { type: 'separator' },
      { label: 'Quit Chop', role: 'quit' },
    ]),
  )
  return tray
}
