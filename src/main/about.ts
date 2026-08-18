import { app } from 'electron'
import { join } from 'node:path'

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app-icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
}

/** Shows Chop's native, platform-appropriate About panel. */
export function showAboutChop(): void {
  app.setAboutPanelOptions({
    applicationName: 'Chop',
    applicationVersion: app.getVersion(),
    credits: 'Personal screen capture and annotation tool',
    copyright: `© ${new Date().getFullYear()} Chop`,
    // Used by Windows and Linux; macOS reads the icon from the app bundle.
    iconPath: iconPath(),
  })
  app.showAboutPanel()
}
