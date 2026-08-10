import {
  app,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron'
import { join } from 'node:path'

export type TrayHandlers = {
  onCapture(): void
  onOpenEditor(): void
  onOpenSettings(): void
  onCheckForUpdates(): void
  /** Capture accelerator, read fresh each time the menu is built. */
  captureShortcut(): string
  captureRoot(): string
}

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray-icon.png')
    : join(app.getAppPath(), 'resources', 'tray-icon.png')
}

function buildMenu(handlers: TrayHandlers): Menu {
  return Menu.buildFromTemplate([
    { label: 'Capture', accelerator: handlers.captureShortcut(), click: handlers.onCapture },
    { label: 'Open Editor', click: handlers.onOpenEditor },
    { type: 'separator' },
    {
      label: 'Open Captures Folder',
      click: () => void shell.openPath(handlers.captureRoot()),
    },
    { label: 'Settings…', click: handlers.onOpenSettings },
    { type: 'separator' },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { label: 'Check for Updates…', click: handlers.onCheckForUpdates },
    { type: 'separator' },
    { label: 'Quit Chop', role: 'quit' },
  ])
}

export type TrayController = {
  readonly tray: Tray
  /** Redraws the menu, for changes made outside it such as a new shortcut. */
  refresh(): void
}

export function createTray(handlers: TrayHandlers): TrayController {
  const icon = nativeImage.createFromPath(iconPath())
  // A template image adapts to light and dark menu bars on macOS.
  icon.setTemplateImage(true)

  const tray = new Tray(icon)
  tray.setToolTip('Chop')

  const refresh = (): void => tray.setContextMenu(buildMenu(handlers))
  refresh()

  return { tray, refresh }
}
