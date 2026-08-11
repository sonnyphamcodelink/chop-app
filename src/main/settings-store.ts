import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ChopSettings,
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
} from './settings-file'

/** Read once at startup and kept in step with every write. */
let cached: ChopSettings | null = null

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Settings as they stand, falling back to defaults on a first run or a bad file. */
export function readSettings(): ChopSettings {
  if (cached) return cached

  try {
    cached = parseSettings(readFileSync(settingsPath(), 'utf8'))
  } catch (error) {
    // A missing file is the normal first run; anything else is worth a line.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Could not read settings: ${reason(error)}`)
    }
    cached = DEFAULT_SETTINGS
  }
  return cached
}

/**
 * Persists the settings and keeps them in memory even when the write fails, so
 * a read-only disk costs the user the next launch rather than this session.
 */
export function writeSettings(settings: ChopSettings): void {
  cached = settings
  try {
    writeFileSync(settingsPath(), serializeSettings(settings), 'utf8')
  } catch (error) {
    console.warn(`Could not save settings: ${reason(error)}`)
  }
}
