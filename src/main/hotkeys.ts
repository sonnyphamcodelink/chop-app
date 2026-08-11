import { globalShortcut } from 'electron'
import {
  acceleratorProblem,
  DEFAULT_CAPTURE_SHORTCUT,
  problemMessage,
} from '@shared/accelerator'

export type ShortcutChange = {
  readonly ok: boolean
  /** The accelerator now in force — unchanged when the change was refused. */
  readonly accelerator: string
  readonly error?: string
}

/** The accelerator the capture handler is registered under, held for rollback. */
let current = DEFAULT_CAPTURE_SHORTCUT
let onCaptureHandler: (() => void) | null = null
/** True while the settings recorder has the hotkey released to it. */
let suspended = false

export function captureShortcut(): string {
  return current
}

function register(accelerator: string): boolean {
  if (!onCaptureHandler) return false
  try {
    return globalShortcut.register(accelerator, onCaptureHandler)
  } catch (error) {
    // Electron throws on accelerators it cannot parse at all.
    console.warn(`Could not register ${accelerator}:`, error)
    return false
  }
}

/**
 * Claims the stored capture shortcut at startup, falling back to the default
 * when another app already owns it. Returns false when nothing could be
 * registered, which leaves the tray as the only way to capture.
 */
export function registerHotkeys(accelerator: string, onCapture: () => void): boolean {
  onCaptureHandler = onCapture
  suspended = false

  const wanted = acceleratorProblem(accelerator) ? DEFAULT_CAPTURE_SHORTCUT : accelerator
  if (register(wanted)) {
    current = wanted
    return true
  }

  console.warn(`Could not register ${wanted}; another app may be using it.`)
  if (wanted !== DEFAULT_CAPTURE_SHORTCUT && register(DEFAULT_CAPTURE_SHORTCUT)) {
    current = DEFAULT_CAPTURE_SHORTCUT
    return true
  }
  current = wanted
  return false
}

/**
 * Moves the capture hotkey to `accelerator`, restoring the previous one when
 * the new one is rejected, so a refused change never leaves Chop with no hotkey.
 */
export function changeCaptureShortcut(
  accelerator: string,
  platform: string = process.platform,
): ShortcutChange {
  const problem = acceleratorProblem(accelerator)
  if (problem) {
    return { ok: false, accelerator: current, error: problemMessage(problem, platform) }
  }
  if (accelerator === current && !suspended) return { ok: true, accelerator: current }

  const previous = current
  if (!suspended) globalShortcut.unregister(previous)

  if (register(accelerator)) {
    current = accelerator
    suspended = false
    return { ok: true, accelerator }
  }

  register(previous)
  suspended = false
  return {
    ok: false,
    accelerator: previous,
    error: 'Another app is already using that shortcut.',
  }
}

/**
 * Releases the capture hotkey so the settings recorder can see the keys the
 * user presses instead of firing a capture. Safe to call twice.
 */
export function suspendCaptureShortcut(): void {
  if (suspended) return
  suspended = true
  globalShortcut.unregister(current)
}

/** Re-claims the hotkey after recording. Reports false if it was lost meanwhile. */
export function resumeCaptureShortcut(): boolean {
  if (!suspended) return true
  suspended = false
  return register(current)
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
  suspended = false
}
