/**
 * The dialog shown when a capture is refused. Pure and dependency-free, the way
 * `updates/update-status.ts` keeps its notice, so the wording can be asserted.
 */
import type { LicenseStatus } from '@shared/license/status'
import { licenseSummary } from '@shared/license/summary'

/** Structural match for Electron's MessageBoxOptions. */
export type LicenseNotice = {
  readonly type: 'info' | 'warning'
  readonly title: string
  readonly message: string
  readonly detail: string
  readonly buttons: readonly string[]
  readonly defaultId: number
  readonly cancelId: number
}

export const ENTER_KEY_BUTTON = 0
export const BUY_BUTTON = 1
export const DISMISS_BUTTON = 2

export const REMOVE_BUTTON = 0
export const KEEP_BUTTON = 1

const TITLES: Record<string, string> = {
  expired: 'Licence expired',
  invalid: 'Licence not recognised',
  'trial-expired': 'Trial ended',
}

/**
 * Only ever called for a status that blocks capture, so it leads with what the
 * user can do about it rather than restating the refusal.
 */
export function licenseNotice(status: LicenseStatus): LicenseNotice {
  const summary = licenseSummary(status)

  return {
    type: 'warning',
    title: TITLES[status.kind] ?? 'Licence required',
    message: summary.headline,
    detail: `${summary.detail}\n\nYour past captures stay where they are, and editing them still works.`,
    buttons: ['Enter Licence…', 'Buy Chop', 'Not Now'],
    defaultId: ENTER_KEY_BUTTON,
    cancelId: DISMISS_BUTTON,
  }
}

/**
 * Asked before a key is removed. Keeping is the default: removing costs a user
 * who no longer has the receipt a support request, while an accidental Cancel
 * costs one more click.
 */
export function removeLicenseNotice(status: LicenseStatus): LicenseNotice {
  const trailing =
    status.kind === 'licensed'
      ? 'Chop will fall back to the trial, which may already have ended.'
      : 'Chop will fall back to the trial.'

  return {
    type: 'warning',
    title: 'Remove licence',
    message: 'Remove this licence from this Mac?',
    detail: `${trailing} You can paste the same key in again at any time - it is in your receipt.`,
    buttons: ['Remove', 'Cancel'],
    defaultId: KEEP_BUTTON,
    cancelId: KEEP_BUTTON,
  }
}
