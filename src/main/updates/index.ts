import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { CHANNELS } from '@shared/ipc'
import type { BackgroundUpdateState } from '@shared/update'
import { fetchLatestRelease } from './fetch-release'
import { downloadAndPrepareUpdate } from './perform-update'
import type { PreparedMacUpdate } from './install-macos'
import { type UpdateStatus, updateNotice, updateStatus } from './update-status'

export type { UpdateStatus }
export { RELEASES_REPO } from './release-feed'

// One check at a time, so repeated tray clicks cannot stack dialogs.
let checking = false
let prepared: PreparedMacUpdate | null = null
let preparedStatus: Extract<UpdateStatus, { readonly kind: 'update-available' }> | null = null
let state: BackgroundUpdateState = { phase: 'idle' }
let abortDownload: AbortController | null = null
let relaunching = false
let onStateChanged: () => void = () => undefined

export type CheckOptions = {
  /** Never show a modal. Used for the background check at launch. */
  readonly silent: boolean
}

function setState(next: BackgroundUpdateState): void {
  state = next
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(CHANNELS.updateStateChanged, next)
  }
  onStateChanged()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function currentUpdateState(): BackgroundUpdateState {
  return state
}

export async function relaunchToUpdate(): Promise<boolean> {
  if (!prepared || !preparedStatus || relaunching) return false
  const update = prepared
  relaunching = true
  setState({ phase: 'preparing', tag: preparedStatus.tag })

  try {
    await update.launchReplacement()
    app.quit()
    return true
  } catch (error) {
    relaunching = false
    console.error('Could not launch the update replacement:', error)
    setState({ phase: 'ready', tag: preparedStatus.tag })
    return false
  }
}

export function registerUpdateHandlers(listener: () => void = () => undefined): void {
  onStateChanged = listener
  ipcMain.handle(CHANNELS.getUpdateState, () => currentUpdateState())
  ipcMain.handle(CHANNELS.relaunchToUpdate, () => relaunchToUpdate())
}

/** Cancels a background transfer and removes a staged update on a normal quit. */
export function discardPreparedUpdate(): void {
  abortDownload?.abort()
  if (prepared && !relaunching) prepared.discardSync()
  if (!relaunching) {
    prepared = null
    preparedStatus = null
  }
}

/**
 * Compares the running version against the newest published release. A newer
 * installer is downloaded, verified, and staged silently; installation waits
 * for an explicit relaunch action from Settings or the tray.
 */
export async function checkForUpdates({ silent }: CheckOptions): Promise<UpdateStatus> {
  if (preparedStatus) return preparedStatus
  if (checking) return { kind: 'check-failed', reason: 'A check is already running.' }
  checking = true
  setState({ phase: 'checking' })

  try {
    const status = updateStatus(app.getVersion(), await fetchLatestRelease())

    if (status.kind === 'check-failed') {
      console.warn(`Update check failed: ${status.reason}`)
      setState({ phase: 'failed', message: status.reason })
      if (!silent) {
        const notice = updateNotice(status)
        await dialog.showMessageBox({ ...notice, buttons: [...notice.buttons] })
      }
      return status
    }
    if (status.kind === 'up-to-date') {
      setState({ phase: 'idle' })
      if (!silent) {
        const notice = updateNotice(status)
        await dialog.showMessageBox({ ...notice, buttons: [...notice.buttons] })
      }
      return status
    }

    abortDownload = new AbortController()
    prepared = await downloadAndPrepareUpdate(status, {
      signal: abortDownload.signal,
      onProgress: (progress) => {
        if (progress.phase === 'downloading') {
          if (state.phase !== 'downloading') setState({ phase: 'downloading', tag: status.tag })
        } else {
          setState({ phase: 'preparing', tag: status.tag })
        }
      },
    })
    abortDownload = null
    preparedStatus = status
    setState({ phase: 'ready', tag: status.tag })
    return status
  } catch (error) {
    const wasCancelled = abortDownload?.signal.aborted === true
    abortDownload = null
    const failed: UpdateStatus = { kind: 'check-failed', reason: errorMessage(error) }
    if (wasCancelled) return failed
    console.error('Background update failed:', error)
    setState({ phase: 'failed', message: failed.reason })
    if (!silent) {
      const notice = updateNotice(failed)
      await dialog.showMessageBox({ ...notice, buttons: [...notice.buttons] })
    }
    return failed
  } finally {
    checking = false
  }
}
