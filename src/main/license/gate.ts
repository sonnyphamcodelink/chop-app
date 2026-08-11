/**
 * The single point where a capture is allowed through or turned away.
 */
import { dialog, shell } from 'electron'
import { openSettingsWindow } from '../settings-window'
import { currentLicenseStatus, PURCHASE_URL } from './index'
import { canCapture } from '@shared/license/status'
import { BUY_BUTTON, ENTER_KEY_BUTTON, licenseNotice } from './notice'
import { isSafePurchaseUrl } from './purchase'

// One dialog at a time, so a held-down hotkey cannot stack them.
let prompting = false

/**
 * True when the capture may proceed. When it may not, the user is told why and
 * offered the two ways out; the capture is dropped either way.
 */
export async function allowCapture(): Promise<boolean> {
  const status = currentLicenseStatus()
  if (canCapture(status)) return true

  if (prompting) return false
  prompting = true

  try {
    const notice = licenseNotice(status)
    const { response } = await dialog.showMessageBox({ ...notice, buttons: [...notice.buttons] })

    if (response === ENTER_KEY_BUTTON) openSettingsWindow('license')
    else if (response === BUY_BUTTON && isSafePurchaseUrl(PURCHASE_URL)) {
      await shell.openExternal(PURCHASE_URL)
    }
  } finally {
    prompting = false
  }

  return false
}
