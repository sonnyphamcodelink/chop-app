/**
 * Remembers that macOS has been asked for Screen Recording access.
 *
 * `getMediaAccessStatus('screen')` reports `denied` both for an app that has
 * never asked and for one the user refused, so it cannot say whether macOS
 * still has its own prompt to show. Without that, Chop cannot tell when its
 * guidance would land on top of the system prompt asking the same thing.
 */
import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let cached: boolean | null = null

function statePath(): string {
  return join(app.getPath('userData'), 'permissions.json')
}

export function screenCaptureRequested(): boolean {
  if (cached !== null) return cached

  try {
    const raw: unknown = JSON.parse(readFileSync(statePath(), 'utf8'))
    cached =
      typeof raw === 'object' &&
      raw !== null &&
      (raw as Record<string, unknown>).screenCaptureRequested === true
  } catch {
    // A missing or hand-edited file is the normal first run.
    cached = false
  }
  return cached
}

export function markScreenCaptureRequested(): void {
  cached = true
  const contents = `${JSON.stringify({ screenCaptureRequested: true }, null, 2)}\n`
  try {
    writeFileSync(statePath(), contents, 'utf8')
  } catch (error) {
    // Losing this costs one duplicated prompt on a later launch, nothing more.
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`Could not record the screen permission request: ${reason}`)
  }
}
