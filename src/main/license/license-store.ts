import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  EMPTY_LICENSE_FILE,
  type LicenseFile,
  parseLicenseFile,
  serializeLicenseFile,
} from './license-file'

/** Read once at startup and kept in step with every write. */
let cached: LicenseFile | null = null

function licensePath(): string {
  return join(app.getPath('userData'), 'license.json')
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function readLicenseFile(): LicenseFile {
  if (cached) return cached

  try {
    cached = parseLicenseFile(readFileSync(licensePath(), 'utf8'))
  } catch (error) {
    // A missing file is the normal first run; anything else is worth a line.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Could not read the licence: ${reason(error)}`)
    }
    cached = EMPTY_LICENSE_FILE
  }
  return cached
}

/**
 * Persists the licence and keeps it in memory even when the write fails, so a
 * read-only disk costs the user the next launch rather than this session.
 */
export function writeLicenseFile(file: LicenseFile): void {
  cached = file
  try {
    writeFileSync(licensePath(), serializeLicenseFile(file), 'utf8')
  } catch (error) {
    console.warn(`Could not save the licence: ${reason(error)}`)
  }
}

/** Test seam: drops the cache so a fresh file is read. */
export function resetLicenseCache(): void {
  cached = null
}
