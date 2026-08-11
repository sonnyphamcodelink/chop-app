import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { CHANNELS } from '@shared/ipc'
import type { ActivationResult, DeactivationResult, LicenseView } from '@shared/license/view'
import {
  activateLicense,
  currentLicenseStatus,
  licenseView,
  PURCHASE_URL,
  removeLicense,
} from '../license'
import { isSafePurchaseUrl } from '../license/purchase'
import { REMOVE_BUTTON, removeLicenseNotice } from '../license/notice'

function broadcast(view: LicenseView): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(CHANNELS.licenseChanged, view)
  }
}

/**
 * `onChanged` runs after the licence changes, so the tray can redraw the state
 * it shows and a blocked capture can start working again.
 */
export function registerLicenseHandlers(onChanged: () => void): void {
  ipcMain.handle(CHANNELS.getLicense, (): LicenseView => licenseView())

  ipcMain.handle(CHANNELS.activateLicense, (_event, key: unknown): ActivationResult => {
    if (typeof key !== 'string') {
      return { ok: false, view: licenseView(), error: 'That is not a licence key.' }
    }

    const result = activateLicense(key)
    if (result.ok) {
      broadcast(result.view)
      onChanged()
    }
    return result
  })

  // Confirmed here rather than in the renderer, so the prompt cannot be skipped
  // and the dialog is a sheet on the window that asked for it.
  ipcMain.handle(CHANNELS.deactivateLicense, async (event): Promise<DeactivationResult> => {
    const notice = removeLicenseNotice(currentLicenseStatus())
    const options = { ...notice, buttons: [...notice.buttons] }
    const parent = BrowserWindow.fromWebContents(event.sender)

    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options)

    if (response !== REMOVE_BUTTON) return { removed: false, view: licenseView() }

    const view = removeLicense()
    broadcast(view)
    onChanged()
    return { removed: true, view }
  })

  // The URL is a constant in the bundle, never anything the renderer sent.
  ipcMain.handle(CHANNELS.openPurchasePage, async (): Promise<void> => {
    if (isSafePurchaseUrl(PURCHASE_URL)) await shell.openExternal(PURCHASE_URL)
  })
}
