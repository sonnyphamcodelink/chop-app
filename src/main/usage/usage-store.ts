/**
 * Owns the path, the in-memory cache, and all reads/writes for `usage.json`.
 *
 * Mirrors `settings-store.ts` / `license-store.ts`:
 *   – Read once, then serve from cache.
 *   – Write updates the cache first; a failed disk write only costs the next
 *     launch, not the current session.
 *   – `resetUsageCache()` is a test seam — never call it in production code.
 *
 * `recordUsage` is the single call site for incrementing a counter; no
 * caller outside this module needs to know the file exists.
 */
import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_USAGE_FILE,
  type UsageCounter,
  type UsageFile,
  parseUsageFile,
  serializeUsageFile,
  withDeviceId,
  withIncrementedCounter,
  withLastReportedDay,
  withReportSent,
} from './usage-file'
import { resolveDeviceId } from './device-id'

let cached: UsageFile | null = null

function usagePath(): string {
  return join(app.getPath('userData'), 'usage.json')
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function readUsage(): UsageFile {
  if (cached) return cached

  try {
    cached = parseUsageFile(readFileSync(usagePath(), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`Could not read usage data: ${reason(error)}`)
    }
    cached = DEFAULT_USAGE_FILE
  }
  return cached
}

export function writeUsage(file: UsageFile): void {
  cached = file
  try {
    writeFileSync(usagePath(), serializeUsageFile(file), 'utf8')
  } catch (error) {
    console.warn(`Could not save usage data: ${reason(error)}`)
  }
}

/**
 * Ensures the file has a device id, resolving it from hardware if this is the
 * very first run.  Must be awaited once before any other store operation.
 */
export async function initUsageStore(): Promise<void> {
  const file = readUsage()
  if (file.deviceId) return // Already initialised.

  const { deviceId, idSource } = await resolveDeviceId()
  writeUsage(withDeviceId(file, deviceId, idSource))
}

/**
 * Increments one of the three counters and persists.
 * Counting continues even when `usageEnabled` is off — the call sites are
 * unconditional so the capture path stays clean.
 */
export function recordUsage(counter: UsageCounter): void {
  writeUsage(withIncrementedCounter(readUsage(), counter))
}

/**
 * Marks a successful report: zeroes counters, advances the pending-since
 * window, and records the reported day.
 */
export function markReported(day: string, now: string): void {
  writeUsage(withLastReportedDay(withReportSent(readUsage(), now), day))
}

/** Test seam: drops the cache so a fresh file is read on the next access. */
export function resetUsageCache(): void {
  cached = null
}
