import { createHash } from 'node:crypto'
import { open, rm } from 'node:fs/promises'
import type { ReleaseAsset } from './release-feed'

export type DownloadProgress = {
  readonly received: number
  readonly total: number
  readonly percent: number
}

export type DownloadOptions = {
  readonly signal: AbortSignal
  readonly onProgress: (progress: DownloadProgress) => void
  readonly fetchImpl?: typeof fetch
}

/**
 * Streams one release asset to disk and refuses to keep it unless its byte
 * count and GitHub-provided SHA-256 both match the release metadata.
 */
export async function downloadUpdate(
  asset: ReleaseAsset,
  destination: string,
  { signal, onProgress, fetchImpl = fetch }: DownloadOptions,
): Promise<void> {
  const response = await fetchImpl(asset.url, {
    headers: { Accept: 'application/octet-stream' },
    redirect: 'follow',
    signal,
  })
  if (!response.ok) throw new Error(`The update server answered ${response.status}.`)
  if (!response.body) throw new Error('The update server returned an empty download.')

  const file = await open(destination, 'wx')
  const digest = createHash('sha256')
  const reader = response.body.getReader()
  let received = 0
  let streamFailure: unknown

  onProgress({ received: 0, total: asset.size, percent: 0 })

  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      if (value.byteLength === 0) continue

      const chunk = Buffer.from(value)
      digest.update(chunk)

      let written = 0
      while (written < chunk.length) {
        const result = await file.write(chunk, written, chunk.length - written, received + written)
        written += result.bytesWritten
      }
      received += chunk.length
      if (received > asset.size) throw new Error('The downloaded update is larger than expected.')

      onProgress({
        received,
        total: asset.size,
        percent: Math.min(100, Math.round((received / asset.size) * 100)),
      })
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    streamFailure = error
  } finally {
    await file.close()
  }

  try {
    if (streamFailure) throw streamFailure
    if (received !== asset.size) {
      throw new Error(`The update download was incomplete (${received} of ${asset.size} bytes).`)
    }
    const actual = digest.digest('hex')
    if (actual !== asset.sha256) throw new Error('The update failed its integrity check.')
  } catch (error) {
    await rm(destination, { force: true })
    throw error
  }
}
