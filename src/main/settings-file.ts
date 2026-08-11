/**
 * Lives apart from `settings-store.ts` so the file format can be asserted
 * without pulling `electron` into the test environment.
 */
import { acceleratorProblem, DEFAULT_CAPTURE_SHORTCUT } from '@shared/accelerator'

export type ChopSettings = {
  /** Electron accelerator for the capture hotkey. */
  readonly captureShortcut: string
}

export const DEFAULT_SETTINGS: ChopSettings = {
  captureShortcut: DEFAULT_CAPTURE_SHORTCUT,
}

function readShortcut(value: unknown): string {
  if (typeof value !== 'string' || acceleratorProblem(value)) {
    return DEFAULT_SETTINGS.captureShortcut
  }
  return value
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

  return { captureShortcut: readShortcut((raw as Record<string, unknown>).captureShortcut) }
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
