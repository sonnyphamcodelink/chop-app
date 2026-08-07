import { app, dialog, shell } from 'electron'
import {
  APPROVAL_NOTICE,
  type LoginItemState,
  loginItemState,
  OPEN_SETTINGS_BUTTON,
  supportsOpenAtLogin,
} from './login-item-state'

export type { LoginItemState }

export const LOGIN_ITEMS_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.LoginItems-Settings.extension'

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Whether the OS currently launches Chop at login. Reported as `unsupported`
 * when the platform has no login items, or when the setting cannot be read —
 * in both cases the tray has nothing it can meaningfully offer to toggle.
 */
export function openAtLoginState(): LoginItemState {
  if (!supportsOpenAtLogin(process.platform)) return 'unsupported'

  try {
    return loginItemState(process.platform, app.getLoginItemSettings())
  } catch (error) {
    console.warn(`Could not read login item settings: ${reason(error)}`)
    return 'unsupported'
  }
}

/**
 * Registers or unregisters Chop as a login item and returns the state the OS
 * reports afterwards, so a rejected write shows up as an unchanged checkmark
 * rather than a menu that lies about what will happen at the next login.
 */
export function setOpenAtLogin(enabled: boolean): LoginItemState {
  if (!supportsOpenAtLogin(process.platform)) return 'unsupported'

  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
  } catch (error) {
    console.warn(`Could not ${enabled ? 'add' : 'remove'} the login item: ${reason(error)}`)
  }

  const state = openAtLoginState()
  if (enabled && state === 'requires-approval') void showApprovalNotice()
  return state
}

async function showApprovalNotice(): Promise<void> {
  const { response } = await dialog.showMessageBox({
    ...APPROVAL_NOTICE,
    buttons: [...APPROVAL_NOTICE.buttons],
  })
  if (response === OPEN_SETTINGS_BUTTON) await shell.openExternal(LOGIN_ITEMS_SETTINGS_URL)
}
