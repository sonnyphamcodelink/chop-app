import {
  app,
  Menu,
  type MenuItemConstructorOptions,
  nativeImage,
  shell,
  Tray,
} from 'electron'
import { join } from 'node:path'
import { captureAccelerator } from './hotkey-accelerator'
import type { LoginItemState } from './login-item-state'

export type TrayHandlers = {
  onCapture(): void
  onOpenEditor(): void
  onCheckForUpdates(): void
  /** Current login item state, read fresh each time the menu is built. */
  openAtLogin(): LoginItemState
  onToggleOpenAtLogin(enabled: boolean): void
  captureRoot(): string
}

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray-icon.png')
    : join(app.getAppPath(), 'resources', 'tray-icon.png')
}

/** Empty on platforms where Electron cannot manage login items. */
function openAtLoginItems(
  handlers: TrayHandlers,
  refresh: () => void,
): MenuItemConstructorOptions[] {
  const state = handlers.openAtLogin()
  if (state === 'unsupported') return []

  // Derived from the state this menu was drawn with rather than from the
  // clicked item, whose `checked` does not reliably carry the new value.
  const enabled = state === 'enabled'

  return [
    {
      label: 'Open at Login',
      type: 'checkbox',
      checked: enabled,
      click: () => {
        handlers.onToggleOpenAtLogin(!enabled)
        // The OS has the last word, so redraw from what it reports.
        refresh()
      },
    },
    { type: 'separator' },
  ]
}

function buildMenu(handlers: TrayHandlers, refresh: () => void): Menu {
  return Menu.buildFromTemplate([
    { label: 'Capture', accelerator: captureAccelerator(), click: handlers.onCapture },
    { label: 'Open Editor', click: handlers.onOpenEditor },
    { type: 'separator' },
    {
      label: 'Open Captures Folder',
      click: () => void shell.openPath(handlers.captureRoot()),
    },
    { type: 'separator' },
    ...openAtLoginItems(handlers, refresh),
    { label: `Version ${app.getVersion()}`, enabled: false },
    { label: 'Check for Updates…', click: handlers.onCheckForUpdates },
    { type: 'separator' },
    { label: 'Quit Chop', role: 'quit' },
  ])
}

export function createTray(handlers: TrayHandlers): Tray {
  const icon = nativeImage.createFromPath(iconPath())
  // A template image adapts to light and dark menu bars on macOS.
  icon.setTemplateImage(true)

  const tray = new Tray(icon)
  tray.setToolTip('Chop')

  // Electron caches the menu it is handed, so toggling rebuilds it.
  const refresh = (): void => tray.setContextMenu(buildMenu(handlers, refresh))
  refresh()

  return tray
}
