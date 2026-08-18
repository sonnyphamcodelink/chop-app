import { app } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadUpdate } from './download-update'
import { prepareMacUpdate, type PreparedMacUpdate } from './install-macos'
import type { UpdateStatus } from './update-status'

type AvailableUpdate = Extract<UpdateStatus, { readonly kind: 'update-available' }>

export type PreparationProgress =
  | { readonly phase: 'downloading'; readonly percent: number }
  | { readonly phase: 'preparing' }

export type PrepareOptions = {
  readonly onProgress: (progress: PreparationProgress) => void
  readonly signal: AbortSignal
}

/** Downloads, verifies, and stages an update without interrupting the running app. */
export async function downloadAndPrepareUpdate(
  update: AvailableUpdate,
  { onProgress, signal }: PrepareOptions,
): Promise<PreparedMacUpdate> {
  let lastPercent = -1
  let prepared: PreparedMacUpdate | null = null
  let workingDirectory: string | null = null

  try {
    workingDirectory = await mkdtemp(join(tmpdir(), 'chop-update-'))
    const dmgPath = join(workingDirectory, update.asset.name)
    await downloadUpdate(update.asset, dmgPath, {
      signal,
      onProgress: (progress) => {
        if (progress.percent === lastPercent) return
        lastPercent = progress.percent
        onProgress({ phase: 'downloading', percent: progress.percent })
      },
    })

    onProgress({ phase: 'preparing' })
    prepared = await prepareMacUpdate(
      dmgPath,
      update.tag,
      process.execPath,
      process.pid,
      app.getPath('logs'),
      workingDirectory,
    )
    return prepared
  } catch (error) {
    if (prepared) await prepared.discard()
    else if (workingDirectory) await rm(workingDirectory, { recursive: true, force: true })
    throw error
  }
}
