/**
 * Lives apart from `settings-store.ts` so the file format can be asserted
 * without pulling `electron` into the test environment.
 */
import { acceleratorProblem, DEFAULT_CAPTURE_SHORTCUT } from '@shared/accelerator'

export type ChopSettings = {
  /** Electron accelerator for the capture hotkey. */
  readonly captureShortcut: string
  /** Whether anonymous daily usage data is sent to the developer. Default on. */
  readonly usageEnabled: boolean
}

export const DEFAULT_SETTINGS: ChopSettings = {
  captureShortcut: DEFAULT_CAPTURE_SHORTCUT,
  usageEnabled: true,
}

function readShortcut(value: unknown): string {
  if (typeof value !== 'string' || acceleratorProblem(value)) {
    return DEFAULT_SETTINGS.captureShortcut
  }
  return value
}

/**
 * Absent key → default true; anything else must be a literal boolean.
 * A hand-edited string like "yes" is not accepted — too easy to make unusable.
 */
function readUsageEnabled(value: unknown): boolean {
  if (value === undefined || value === null) return DEFAULT_SETTINGS.usageEnabled
  return value !== false
}

/**
 * Never throws: a settings file that is missing, truncated or hand-edited into
 * nonsense falls back to defaults rather than stopping the app from starting.
 */
export function parseSettings(json: string | null): ChopSettings {
  if (!json) return DEFAULT_SETTINGS

  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return DEFAULT_SETTINGS
  }
  if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS

  const r = raw as Record<string, unknown>
  return {
    captureShortcut: readShortcut(r.captureShortcut),
    usageEnabled: readUsageEnabled(r.usageEnabled),
  }
}

export function serializeSettings(settings: ChopSettings): string {
  return `${JSON.stringify(settings, null, 2)}\n`
}

export function withCaptureShortcut(
  settings: ChopSettings,
  captureShortcut: string,
): ChopSettings {
  return { ...settings, captureShortcut }
}

export function withUsageEnabled(settings: ChopSettings, usageEnabled: boolean): ChopSettings {
  return { ...settings, usageEnabled }
}
