import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { addRecord, type CaptureRecord, emptyManifest, type Manifest } from '@shared/manifest'
import { readManifest, writeManifest } from './manifest-store'
import { capturePaths, sidecarDirs } from './paths'

export { readManifest, writeManifest }

export type SaveCaptureInput = {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly width: number
  readonly height: number
  readonly flatPng: Buffer
  readonly originalPng: Buffer
  readonly thumbPng: Buffer
  readonly documentJson: string
}

async function ensureDirs(rootDir: string): Promise<void> {
  const dirs = sidecarDirs(rootDir)
  await mkdir(rootDir, { recursive: true })
  await Promise.all([
    mkdir(dirs.originals, { recursive: true }),
    mkdir(dirs.docs, { recursive: true }),
    mkdir(dirs.thumbs, { recursive: true }),
  ])
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Writes every artefact for a capture and updates the manifest. The original is
 * written only once, so re-saving an annotated image never destroys the source.
 */
export async function saveCapture(
  rootDir: string,
  input: SaveCaptureInput,
): Promise<CaptureRecord> {
  await ensureDirs(rootDir)
  const paths = capturePaths(rootDir, input.name)

  await writeFile(paths.flat, input.flatPng)
  await writeFile(paths.thumb, input.thumbPng)
  await writeFile(paths.doc, input.documentJson, 'utf8')
  if (!(await exists(paths.original))) {
    await writeFile(paths.original, input.originalPng)
  }

  const record: CaptureRecord = {
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    width: input.width,
    height: input.height,
  }
  await writeManifest(rootDir, addRecord(await readManifest(rootDir), record))
  return record
}

export async function loadCapture(
  rootDir: string,
  record: CaptureRecord,
): Promise<{ readonly originalPng: Buffer; readonly documentJson: string | null }> {
  const paths = capturePaths(rootDir, record.name)
  const originalPng = await readFile(
    (await exists(paths.original)) ? paths.original : paths.flat,
  )
  const documentJson = (await exists(paths.doc))
    ? await readFile(paths.doc, 'utf8')
    : null
  return { originalPng, documentJson }
}

/** Recovery path when the manifest is missing or damaged. */
export async function rebuildManifest(rootDir: string): Promise<Manifest> {
  let entries: readonly string[]
  try {
    entries = await readdir(rootDir)
  } catch {
    return emptyManifest()
  }

  const names = entries
    .filter((entry) => extname(entry).toLowerCase() === '.png')
    .map((entry) => basename(entry, extname(entry)))
    .sort()
    .reverse()

  const records = await Promise.all(
    names.map(async (name): Promise<CaptureRecord> => {
      const created = await stat(join(rootDir, `${name}.png`))
      return {
        id: randomUUID(),
        name,
        createdAt: created.birthtime.toISOString(),
        width: 0,
        height: 0,
      }
    }),
  )

  const manifest: Manifest = { version: 1, records }
  await writeManifest(rootDir, manifest)
  return manifest
}
