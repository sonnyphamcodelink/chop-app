import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadUpdate } from '../../../src/main/updates/download-update'
import type { ReleaseAsset } from '../../../src/main/updates/release-feed'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

async function destination(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'chop-download-test-'))
  temporaryDirectories.push(directory)
  return join(directory, 'update.dmg')
}

function assetFor(body: Uint8Array): ReleaseAsset {
  return {
    name: 'Chop-mac-arm64.dmg',
    url: 'https://github.com/sonnyphamcodelink/chop-releases/releases/download/v1.0.0/Chop-mac-arm64.dmg',
    size: body.byteLength,
    sha256: createHash('sha256').update(body).digest('hex'),
  }
}

const responseWith = (body: Uint8Array, status = 200): typeof fetch =>
  (async () => new Response(body as unknown as BodyInit, { status })) as unknown as typeof fetch

describe('downloadUpdate', () => {
  it('streams a verified asset and reports determinate progress', async () => {
    const body = new TextEncoder().encode('a real update')
    const path = await destination()
    const progress: number[] = []

    await downloadUpdate(assetFor(body), path, {
      signal: new AbortController().signal,
      onProgress: (event) => progress.push(event.percent),
      fetchImpl: responseWith(body),
    })

    expect(await readFile(path)).toEqual(Buffer.from(body))
    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBe(100)
  })

  it('deletes a download whose digest does not match', async () => {
    const body = new TextEncoder().encode('tampered')
    const path = await destination()
    const asset = { ...assetFor(body), sha256: '0'.repeat(64) }

    await expect(
      downloadUpdate(asset, path, {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        fetchImpl: responseWith(body),
      }),
    ).rejects.toThrow('integrity')
    await expect(readFile(path)).rejects.toThrow()
  })

  it('rejects an incomplete response and removes it', async () => {
    const body = new TextEncoder().encode('short')
    const path = await destination()
    const asset = { ...assetFor(body), size: body.byteLength + 1 }

    await expect(
      downloadUpdate(asset, path, {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        fetchImpl: responseWith(body),
      }),
    ).rejects.toThrow('incomplete')
    await expect(readFile(path)).rejects.toThrow()
  })

  it('does not create a file when the server rejects the request', async () => {
    const body = new TextEncoder().encode('missing')
    const path = await destination()

    await expect(
      downloadUpdate(assetFor(body), path, {
        signal: new AbortController().signal,
        onProgress: () => undefined,
        fetchImpl: responseWith(body, 404),
      }),
    ).rejects.toThrow('404')
    await expect(readFile(path)).rejects.toThrow()
  })

  it('stops and removes the partial file when cancelled', async () => {
    const body = new TextEncoder().encode('cancel this update')
    const path = await destination()
    const controller = new AbortController()

    await expect(
      downloadUpdate(assetFor(body), path, {
        signal: controller.signal,
        onProgress: ({ received }) => {
          if (received > 0) controller.abort()
        },
        fetchImpl: responseWith(body),
      }),
    ).rejects.toThrow()
    await expect(readFile(path)).rejects.toThrow()
  })
})
