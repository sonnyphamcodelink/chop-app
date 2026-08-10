/**
 * Lives apart from `login-item.ts` so the state mapping and the approval copy
 * can be asserted without pulling `electron` into the test environment.
 */

import type { LoginItemState } from '@shared/ipc'

export type { LoginItemState }

/** Structural match for Electron's LoginItemSettings, kept dependency-free. */
export type LoginItemSettingsLike = {
  readonly openAtLogin: boolean
  /** macOS 13 and up only; Windows reports nothing here. */
  readonly status?: 'not-registered' | 'enabled' | 'requires-approval' | 'not-found'
}

export function supportsOpenAtLogin(platform: string): boolean {
  return platform === 'darwin' || platform === 'win32'
}

export function loginItemState(
  platform: string,
  settings: LoginItemSettingsLike,
): LoginItemState {
  if (!supportsOpenAtLogin(platform)) return 'unsupported'
  // On macOS 13 and up the login item can be registered yet switched off by the
  // user in System Settings, which `openAtLogin` alone does not distinguish.
  if (settings.status === 'requires-approval') return 'requires-approval'
  return settings.openAtLogin ? 'enabled' : 'disabled'
}

/** Structural match for Electron's MessageBoxOptions, kept dependency-free. */
export type LoginItemNotice = {
  readonly type: 'info' | 'warning'
  readonly title: string
  readonly message: string
  readonly detail: string
  readonly buttons: readonly string[]
  readonly defaultId: number
  readonly cancelId: number
}

/** Index of the button that opens the Login Items pane. */
export const OPEN_SETTINGS_BUTTON = 0

export const APPROVAL_NOTICE: LoginItemNotice = {
  type: 'warning',
  title: 'Approval required',
  message: 'macOS needs you to allow Chop to open at login.',
  detail: 'Turn Chop on under Login Items in System Settings to finish enabling this.',
  buttons: ['Open System Settings', 'Later'],
  defaultId: OPEN_SETTINGS_BUTTON,
  cancelId: 1,
}
