import { desktopCapturer, dialog, shell, systemPreferences } from 'electron'
import { type PermissionState, permissionMessage } from './permissions-message'
import { markScreenCaptureRequested, screenCaptureRequested } from './permissions-store'

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

/**
 * Asks macOS to put Chop in the Screen Recording list. The status check
 * (`getMediaAccessStatus`) never registers the app; only an actual capture
 * attempt does. Electron reports `denied` for an ad-hoc build that has never
 * appeared in the list, so this must run in that state too.
 */
export async function requestScreenCaptureAccess(): Promise<boolean> {
  if (process.platform !== 'darwin') return true
  try {
    await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 16, height: 16 },
      fetchWindowIcons: false,
    })
    return screenPermissionState() === 'granted'
  } catch (error) {
    console.warn('Screen capture request failed.', error)
    return false
  }
}

export async function openScreenRecordingSettings(): Promise<void> {
  await shell.openExternal(SETTINGS_URL)
}

/** Returns true when capture may proceed. Shows actionable guidance otherwise. */
export async function ensureScreenPermission(): Promise<boolean> {
  const state = screenPermissionState()
  if (state === 'granted' || state === 'unsupported') return true

  // macOS prompts for the first capture attempt and never again. That prompt
  // already offers to open the same pane this dialog would, so only one of the
  // two ever runs.
  if (!screenCaptureRequested()) {
    markScreenCaptureRequested()
    return await requestScreenCaptureAccess()
  }

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
