import type { WindowRect } from '@shared/window-rect'

export interface WindowProvider {
  /** On-screen windows in global DIP coordinates, ordered front to back. */
  listWindows(): Promise<readonly WindowRect[]>
}
