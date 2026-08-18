import {
  app,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron'
import { join } from 'node:path'
import { needsLicense } from '@shared/license/status'
import type { LicenseStatus } from '@shared/license/status'
import { trayLicenseLabel } from '@shared/license/summary'

export type TrayHandlers = {
  onAbout(): void
  onCapture(): void
  onOpenEditor(): void
  onOpenSettings(): void
  onOpenLicense(): void
  onCheckForUpdates(): void
  /** Capture accelerator, read fresh each time the menu is built. */
  captureShortcut(): string
  captureRoot(): string
  /** Licence state, read fresh each time the menu is built. */
  licenseStatus(): LicenseStatus
}

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray-icon.png')
    : join(app.getAppPath(), 'resources', 'tray-icon.png')
}

function buildMenu(handlers: TrayHandlers): Menu {
  const status = handlers.licenseStatus()

  return Menu.buildFromTemplate([
    { label: 'About Chop', click: handlers.onAbout },
    { type: 'separator' },
    { label: 'Capture', accelerator: handlers.captureShortcut(), click: handlers.onCapture },
    { label: 'Open Editor', click: handlers.onOpenEditor },
    { type: 'separator' },
    {
      label: 'Open Captures Folder',
      click: () => void shell.openPath(handlers.captureRoot()),
    },
    { label: 'Settings…', click: handlers.onOpenSettings },
    { type: 'separator' },
    { label: trayLicenseLabel(status), enabled: false },
    // Nothing to offer once a good key is installed; the pane is still in Settings.
    ...(needsLicense(status)
      ? [{ label: 'Enter Licence…', click: handlers.onOpenLicense }]
      : []),
    { type: 'separator' as const },
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
