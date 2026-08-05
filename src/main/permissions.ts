import { dialog, shell, systemPreferences } from 'electron'
import { type PermissionState, permissionMessage } from './permissions-message'

export { permissionMessage }
export type { PermissionState }

const SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

export function screenPermissionState(): PermissionState {
  if (process.platform !== 'darwin') return 'unsupported'
  const status = systemPreferences.getMediaAccessStatus('screen')
  if (status === 'granted') return 'granted'
  if (status === 'denied' || status === 'restricted') return 'denied'
  return 'not-determined'
}

export async function openScreenRecordingSettings(): Promise<void> {
  await shell.openExternal(SETTINGS_URL)
}

/** Returns true when capture may proceed. Shows actionable guidance otherwise. */
export async function ensureScreenPermission(): Promise<boolean> {
  const state = screenPermissionState()
  if (state === 'granted' || state === 'unsupported') return true

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'Screen Recording permission required',
    message: permissionMessage(state),
  })
  if (response === 0) await openScreenRecordingSettings()
  return false
}
