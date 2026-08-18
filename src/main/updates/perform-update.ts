import { app } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadUpdate } from './download-update'
import { prepareMacUpdate, type PreparedMacUpdate } from './install-macos'
import type { UpdateStatus } from './update-status'
import { openUpdateWindow } from './update-window'

type AvailableUpdate = Extract<UpdateStatus, { readonly kind: 'update-available' }>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function downloadAndInstallUpdate(update: AvailableUpdate): Promise<void> {
  const abort = new AbortController()
  const window = openUpdateWindow(update.tag, () => abort.abort())
  let lastPercent = -1
  let prepared: PreparedMacUpdate | null = null
  let workingDirectory: string | null = null

  try {
    workingDirectory = await mkdtemp(join(tmpdir(), 'chop-update-'))
    const dmgPath = join(workingDirectory, update.asset.name)
    await downloadUpdate(update.asset, dmgPath, {
      signal: abort.signal,
      onProgress: (progress) => {
        if (progress.percent === lastPercent) return
        lastPercent = progress.percent
        window.send({ phase: 'downloading', tag: update.tag, ...progress })
      },
    })
    abort.signal.throwIfAborted()

    window.send({
      phase: 'preparing',
      tag: update.tag,
      message: 'The download is verified. Chop is preparing the replacement and will reopen shortly.',
    })
    prepared = await prepareMacUpdate(
      dmgPath,
      update.tag,
      process.execPath,
      process.pid,
      app.getPath('logs'),
      workingDirectory,
    )
    await prepared.launchReplacement()
    window.allowAppQuit()
    app.quit()
  } catch (error) {
    if (prepared) await prepared.discard()
    else if (workingDirectory) await rm(workingDirectory, { recursive: true, force: true })
    if (abort.signal.aborted) return
    console.error('Update installation failed:', error)
    window.send({ phase: 'failed', tag: update.tag, message: errorMessage(error) })
  }
}
