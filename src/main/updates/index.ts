import { app, dialog, shell } from 'electron'
import { fetchLatestRelease } from './fetch-release'
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
 * Compares the running version against the newest published release. Chop is
 * ad-hoc signed on macOS, which rules out installing an update in place, so the
 * most this can do is tell the user and open the download page for them.
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
      await shell.openExternal(status.url)
    }
    return status
  } finally {
    checking = false
  }
}
