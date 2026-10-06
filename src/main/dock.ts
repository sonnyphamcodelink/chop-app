import { app } from 'electron'

/**
 * Chop is a regular Dock app as well as a menu-bar app. macOS can quietly
 * demote the process when windows hide or all-workspace overlays show, so the
 * policy and Dock icon are re-asserted rather than set once at launch.
 */
export function ensureDockIcon(): void {
  if (process.platform !== 'darwin') return
  app.setActivationPolicy('regular')
  void app.dock?.show()
}
