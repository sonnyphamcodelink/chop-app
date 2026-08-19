/**
 * Shape of `usage.json`. Kept apart from `usage-store.ts` so the file format
 * can be asserted in tests without pulling `electron` into the environment —
 * the same contract `settings-file.ts` and `license-file.ts` hold.
 *
 * Counters are monotonic integers, reset to zero only after a successful
 * report.  Writes are frequent (every capture) but tiny.
 */

export type UsageCounter = 'captures' | 'imagesSaved' | 'imagesCopied'

export type UsageFile = {
  /** HMAC-SHA256 of the IOPlatformUUID, written once and never updated. */
  readonly deviceId: string
  /** How the id was derived; rows with 'random' can be excluded for retention. */
  readonly idSource: 'hardware' | 'random'
  /** Pending captures not yet reported. */
  readonly captures: number
  /** Pending saves not yet reported. */
  readonly imagesSaved: number
  /** Pending copies not yet reported. */
  readonly imagesCopied: number
  /**
   * When the current accumulation window started — the `pendingSince` of the
   * last successful report, so the server knows the span being covered.
   * Null before the first report.
   */
  readonly pendingSince: string | null
  /**
   * The local `YYYY-MM-DD` day of the last successful report.
   * Null before the first report.
   */
  readonly lastReportedDay: string | null
}

export const DEFAULT_USAGE_FILE: UsageFile = {
  deviceId: '',
  idSource: 'random',
  captures: 0,
  imagesSaved: 0,
  imagesCopied: 0,
  pendingSince: null,
  lastReportedDay: null,
}

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function readLocalDay(value: unknown): string | null {
  const text = readString(value)
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  return text
}

function readInstant(value: unknown): string | null {
  const text = readString(value)
  if (!text || !Number.isFinite(Date.parse(text))) return null
  return text
}

function readIdSource(value: unknown): 'hardware' | 'random' {
  return value === 'hardware' ? 'hardware' : 'random'
}

function readNonNegativeInt(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.trunc(value))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Never throws: a missing, truncated, or hand-edited file falls back to
 * `DEFAULT_USAGE_FILE` rather than stopping the app.
 */
export function parseUsageFile(json: string | null): UsageFile {
  if (!json) return DEFAULT_USAGE_FILE

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return DEFAULT_USAGE_FILE
  }
  if (typeof raw !== 'object' || raw === null) return DEFAULT_USAGE_FILE

  const r = raw as Record<string, unknown>
  const deviceId = readString(r.deviceId)

  // A file without a valid deviceId is treated as uninitialized — the store
  // will call resolveDeviceId() to populate it.
  if (!deviceId) return DEFAULT_USAGE_FILE

  return {
    deviceId,
    idSource: readIdSource(r.idSource),
    captures: readNonNegativeInt(r.captures),
    imagesSaved: readNonNegativeInt(r.imagesSaved),
    imagesCopied: readNonNegativeInt(r.imagesCopied),
    pendingSince: readInstant(r.pendingSince),
    lastReportedDay: readLocalDay(r.lastReportedDay),
  }
}

export function serializeUsageFile(file: UsageFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

// ---------------------------------------------------------------------------
// Immutable updaters — each returns a new object, never mutates the input
// ---------------------------------------------------------------------------

/** Records a single counter increment. */
export function withIncrementedCounter(file: UsageFile, counter: UsageCounter): UsageFile {
  return { ...file, [counter]: file[counter] + 1 }
}

/** Stamps the device identity. Called once when the file is first created. */
export function withDeviceId(
  file: UsageFile,
  deviceId: string,
  idSource: 'hardware' | 'random',
): UsageFile {
  return { ...file, deviceId, idSource }
}

/**
 * Resets pending counters after a successful report and advances the window
 * start to `now` (ISO 8601 instant).
 */
export function withReportSent(file: UsageFile, now: string): UsageFile {
  return {
    ...file,
    captures: 0,
    imagesSaved: 0,
    imagesCopied: 0,
    pendingSince: now,
  }
}

/** Records the local calendar day that was just successfully reported. */
export function withLastReportedDay(file: UsageFile, day: string): UsageFile {
  return { ...file, lastReportedDay: day }
}
