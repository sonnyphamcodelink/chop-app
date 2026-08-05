import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { emptyManifest, type Manifest, parseManifest } from '@shared/manifest'
import { manifestPath } from './paths'

export async function readManifest(rootDir: string): Promise<Manifest> {
  try {
    return parseManifest(await readFile(manifestPath(rootDir), 'utf8'))
  } catch {
    // Missing or unreadable: an empty manifest is the correct starting point.
    return emptyManifest()
  }
}

/** Writes via a temp file and rename so a crash cannot truncate the manifest. */
export async function writeManifest(rootDir: string, manifest: Manifest): Promise<void> {
  const target = manifestPath(rootDir)
  const temp = `${target}.tmp`
  // The sidecar may not exist yet: writeManifest is reachable before any capture
  // has been saved, via manifest rebuild or a first-run write.
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temp, JSON.stringify(manifest, null, 2), 'utf8')
  await rename(temp, target)
}
