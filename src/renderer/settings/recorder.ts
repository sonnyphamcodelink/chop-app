import {
  acceleratorFromEvent,
  acceleratorProblem,
  formatModifiers,
  modifiersFromEvent,
  problemMessage,
} from '@shared/accelerator'

/** Physical keys that only ever act as modifiers, so they never end a chord. */
const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
])

export type RecorderHandlers = {
  /** A complete, usable chord was typed. */
  onRecord(accelerator: string): void
  /** Modifiers held so far, or an empty string once recording stops. */
  onPreview(display: string): void
  /** Why the chord so far cannot be used, or null while nothing is wrong. */
  onProblem(message: string | null): void
  /** Recording started or stopped, so the hotkey can be released and reclaimed. */
  onRecordingChange(recording: boolean): void
}

export type Recorder = {
  readonly isRecording: () => boolean
  stop(): void
}

/**
 * Turns key presses on `trigger` into an accelerator. Recording starts on
 * click and ends on Escape, on blur, or as soon as a usable chord is typed.
 */
export function createRecorder(
  trigger: HTMLElement,
  platform: string,
  handlers: RecorderHandlers,
): Recorder {
  let recording = false

  const stop = (): void => {
    if (!recording) return
    recording = false
    handlers.onPreview('')
    handlers.onRecordingChange(false)
  }

  const start = (): void => {
    if (recording) return
    recording = true
    handlers.onProblem(null)
    handlers.onPreview('')
    handlers.onRecordingChange(true)
  }

  trigger.addEventListener('click', () => (recording ? stop() : start()))
  trigger.addEventListener('blur', stop)

  window.addEventListener('keydown', (event) => {
    if (!recording) return
    // Nothing typed while recording should reach the page's own shortcuts.
    event.preventDefault()
    event.stopPropagation()

    if (event.code === 'Escape') {
      stop()
      return
    }
    if (MODIFIER_CODES.has(event.code)) {
      handlers.onProblem(null)
      handlers.onPreview(formatModifiers(modifiersFromEvent(event, platform), platform))
      return
    }

    const accelerator = acceleratorFromEvent(event, platform)
    if (!accelerator) {
      handlers.onProblem(problemMessage('unsupported-key', platform))
      return
    }

    const problem = acceleratorProblem(accelerator)
    if (problem) {
      // Keep listening: the user has only to add a modifier and try again.
      handlers.onProblem(problemMessage(problem, platform))
      return
    }

    stop()
    handlers.onRecord(accelerator)
  })

  return { isRecording: () => recording, stop }
}
