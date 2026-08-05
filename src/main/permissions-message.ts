export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'unsupported'

/** Actionable guidance for each permission state. Empty when nothing is wrong. */
export function permissionMessage(state: PermissionState): string {
  switch (state) {
    case 'denied':
      return (
        'Chop needs Screen Recording permission to capture your screen.\n\n' +
        'Open System Settings → Privacy & Security → Screen Recording, ' +
        'enable Chop, then relaunch the app.'
      )
    case 'not-determined':
      return (
        'Chop needs Screen Recording permission to capture your screen.\n\n' +
        'macOS will ask for it the first time you capture. If no prompt appears, ' +
        'grant it in System Settings → Privacy & Security → Screen Recording.'
      )
    default:
      return ''
  }
}
