import { app, dialog } from 'electron'
import { fetchLatestRelease } from './fetch-release'
import { downloadAndInstallUpdate } from './perform-update'
import { DOWNLOAD_BUTTON, type UpdateStatus, updateNotice, updateStatus } from './update-status'

export type { UpdateStatus }
export { RELEASES_REPO } from './release-feed'

// One check at a time, so repeated tray clicks cannot stack dialogs.
let checking = false

export type CheckOptions = {
  /** Say nothing unless there is an update. Used for the check at launch. */
  readonly silent: boolean
}

/**
 * Compares the running version against the newest published release and offers
 * to download, verify, stage, and replace the installed Mac application.
 */
export async function checkForUpdates({ silent }: CheckOptions): Promise<UpdateStatus> {
  if (checking) return { kind: 'check-failed', reason: 'A check is already running.' }
  checking = true

  try {
    const status = updateStatus(app.getVersion(), await fetchLatestRelease())

    if (status.kind === 'check-failed') {
      console.warn(`Update check failed: ${status.reason}`)
    }
    if (silent && status.kind !== 'update-available') return status

    const notice = updateNotice(status)
    const { response } = await dialog.showMessageBox({ ...notice, buttons: [...notice.buttons] })
    if (status.kind === 'update-available' && response === DOWNLOAD_BUTTON) {
      await downloadAndInstallUpdate(status)
    }
    return status
  } finally {
    checking = false
  }
}
