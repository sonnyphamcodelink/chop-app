import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyManifest } from '@shared/manifest'
import {
  loadCapture,
  readManifest,
  rebuildManifest,
  saveCapture,
  writeManifest,
} from '../../../src/main/storage/capture-store'

let root: string

// A one-pixel PNG — enough to prove bytes round-trip without a real encoder.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const input = {
  id: 'id-1',
  name: '2026-08-04 15-42-07',
  createdAt: '2026-08-04T15:42:07.000Z',
  width: 800,
  height: 600,
  flatPng: PNG,
  originalPng: PNG,
  thumbPng: PNG,
  documentJson: '{"id":"id-1","width":800,"height":600,"cropRect":null,"annotations":[]}',
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'chop-test-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('saveCapture', () => {
  it('writes the flattened PNG to the visible folder', async () => {
    await saveCapture(root, input)
    await expect(readFile(join(root, '2026-08-04 15-42-07.png'))).resolves.toEqual(PNG)
  })

  it('writes the original, document, and thumbnail into the sidecar', async () => {
    await saveCapture(root, input)
    const base = join(root, '.chop')
    await expect(
      readFile(join(base, 'originals', '2026-08-04 15-42-07.png')),
    ).resolves.toEqual(PNG)
    await expect(
      readFile(join(base, 'thumbs', '2026-08-04 15-42-07.png')),
    ).resolves.toEqual(PNG)
    await expect(
      readFile(join(base, 'docs', '2026-08-04 15-42-07.json'), 'utf8'),
    ).resolves.toBe(input.documentJson)
  })

  it('adds the record to the manifest', async () => {
    await saveCapture(root, input)
    const manifest = await readManifest(root)
    expect(manifest.records.map((r) => r.id)).toEqual(['id-1'])
  })

  it('replaces rather than duplicates when saving the same id twice', async () => {
    await saveCapture(root, input)
    await saveCapture(root, { ...input, width: 1000 })
    const manifest = await readManifest(root)
    expect(manifest.records).toHaveLength(1)
    expect(manifest.records[0]?.width).toBe(1000)
  })

  it('creates the capture directory when it does not exist', async () => {
    const nested = join(root, 'a', 'b', 'Chop')
    await saveCapture(nested, input)
    await expect(readFile(join(nested, '2026-08-04 15-42-07.png'))).resolves.toEqual(PNG)
  })

  it('never overwrites the original when re-saving an annotated flat image', async () => {
    await saveCapture(root, input)
    const annotated = Buffer.concat([PNG, Buffer.from([0])])
    await saveCapture(root, { ...input, flatPng: annotated })
    await expect(
      readFile(join(root, '.chop', 'originals', '2026-08-04 15-42-07.png')),
    ).resolves.toEqual(PNG)
  })
})

describe('readManifest', () => {
  it('returns an empty manifest when none exists', async () => {
    await expect(readManifest(root)).resolves.toEqual(emptyManifest())
  })

  it('returns an empty manifest when the file is corrupt', async () => {
    await writeManifest(root, emptyManifest())
    await writeFile(join(root, '.chop', 'manifest.json'), '{not json')
    await expect(readManifest(root)).resolves.toEqual(emptyManifest())
  })
})

describe('rebuildManifest', () => {
  it('reconstructs records by scanning PNGs in the capture folder', async () => {
    await saveCapture(root, input)
    await saveCapture(root, { ...input, id: 'id-2', name: '2026-08-04 16-00-00' })
    await rm(join(root, '.chop', 'manifest.json'))

    const rebuilt = await rebuildManifest(root)
    expect(rebuilt.records.map((r) => r.name)).toEqual([
      '2026-08-04 16-00-00',
      '2026-08-04 15-42-07',
    ])
  })

  it('returns an empty manifest for an empty directory', async () => {
    await expect(rebuildManifest(root)).resolves.toEqual(emptyManifest())
  })
})

describe('loadCapture', () => {
  it('returns the original bytes and the document JSON', async () => {
    const record = await saveCapture(root, input)
    const loaded = await loadCapture(root, record)
    expect(loaded.originalPng).toEqual(PNG)
    expect(loaded.documentJson).toBe(input.documentJson)
  })

  it('returns a null document when the sidecar JSON is missing', async () => {
    const record = await saveCapture(root, input)
    await rm(join(root, '.chop', 'docs', '2026-08-04 15-42-07.json'))
    await expect(loadCapture(root, record)).resolves.toMatchObject({ documentJson: null })
  })
})
