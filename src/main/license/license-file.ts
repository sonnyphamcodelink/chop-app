/**
 * Shape of `license.json`. Kept apart from `license-store.ts` so the format can
 * be asserted without pulling `electron` into the test environment, matching
 * how settings are split.
 *
 * The licence lives in its own file rather than in `settings.json` so that
 * clearing preferences never costs someone the key they paid for.
 */

export type LicenseFile = {
  /** The key exactly as the user pasted it, or null when none is installed. */
  readonly key: string | null
  /** ISO 8601 instant of first launch, which starts the trial clock. */
  readonly trialStartedAt: string | null
}

export const EMPTY_LICENSE_FILE: LicenseFile = { key: null, trialStartedAt: null }

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function readInstant(value: unknown): string | null {
  const text = readString(value)
  if (!text || !Number.isFinite(Date.parse(text))) return null
  return text
}

/**
 * Never throws: a missing, truncated or hand-edited file reads as "no licence,
 * no trial stamp yet" rather than stopping the app from starting.
 */
export function parseLicenseFile(json: string | null): LicenseFile {
  if (!json) return EMPTY_LICENSE_FILE

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return EMPTY_LICENSE_FILE
  }
  if (typeof raw !== 'object' || raw === null) return EMPTY_LICENSE_FILE

  const record = raw as Record<string, unknown>
  return {
    key: readString(record.key),
    trialStartedAt: readInstant(record.trialStartedAt),
  }
}

export function serializeLicenseFile(file: LicenseFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

export function withLicenseKey(file: LicenseFile, key: string | null): LicenseFile {
  return { ...file, key }
}

/** Stamps the trial start, leaving an existing stamp alone so it cannot be reset. */
export function withTrialStarted(file: LicenseFile, startedAt: string): LicenseFile {
  if (file.trialStartedAt) return file
  return { ...file, trialStartedAt: startedAt }
}
