import type { WindowRect } from '@shared/window-rect'
import type { WindowProvider } from './types'

/** Returns fixed fixture data so tests and E2E runs never touch the OS. */
export function createStubWindowProvider(windows: readonly WindowRect[]): WindowProvider {
  return { listWindows: () => Promise.resolve(windows) }
}
