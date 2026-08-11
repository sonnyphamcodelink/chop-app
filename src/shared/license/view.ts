/**
 * What crosses the IPC boundary about a licence. Types only: the renderer is
 * told the state, it never decides it.
 */
import type { LicenseStatus } from './status'

export type LicenseView = {
  readonly status: LicenseStatus
  /** A recognisable fragment of the installed key, or null when none is. */
  readonly maskedKey: string | null
  /** Where the "Buy Chop" button goes. */
  readonly purchaseUrl: string
}

/** Answer to an activation attempt; `view` is the state left behind either way. */
export type ActivationResult = {
  readonly ok: boolean
  readonly view: LicenseView
  /** Why the key was refused, ready to show. */
  readonly error?: string
}

/**
 * Answer to a removal request. `removed` is false when the user backed out of
 * the confirmation, in which case `view` is simply the unchanged state.
 */
export type DeactivationResult = {
  readonly removed: boolean
  readonly view: LicenseView
}
