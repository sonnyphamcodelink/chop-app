import { DEFAULT_CAPTURE_SHORTCUT } from '@shared/accelerator'
import type { ShortcutInfo, ShortcutUpdate } from '@shared/ipc'
import { createRecorder } from './recorder'

type SettingsBridge = {
  platform: string
  getShortcut(): Promise<ShortcutInfo>
  setShortcut(accelerator: string): Promise<ShortcutUpdate>
  setRecording(recording: boolean): void
}

const bridge = (window as unknown as { chopSettings: SettingsBridge }).chopSettings

const field = document.querySelector<HTMLButtonElement>('#shortcut')!
const reset = document.querySelector<HTMLButtonElement>('#reset')!
const status = document.querySelector<HTMLParagraphElement>('#status')!

const IDLE_HINT = 'Click the shortcut, then press the keys you want to use.'
const RECORDING_HINT = 'Press the new shortcut, or Escape to keep the current one.'

let shortcut: ShortcutInfo = { accelerator: DEFAULT_CAPTURE_SHORTCUT, display: '…' }

function showStatus(message: string, isError = false): void {
  status.textContent = message
  status.classList.toggle('error', isError)
}

function showShortcut(next: ShortcutInfo): void {
  shortcut = next
  field.textContent = next.display
  reset.disabled = next.accelerator === DEFAULT_CAPTURE_SHORTCUT
}

async function apply(accelerator: string): Promise<void> {
  try {
    const update = await bridge.setShortcut(accelerator)
    // The main process answers with what is actually in force, which is the
    // old shortcut when the new one was refused.
    showShortcut(update.shortcut)
    showStatus(update.ok ? `Capture is now ${update.shortcut.display}.` : update.error ?? IDLE_HINT, !update.ok)
  } catch (error) {
    console.error('Could not change the shortcut.', error)
    showStatus('Chop could not change the shortcut. Try again.', true)
  }
}

const recorder = createRecorder(field, bridge.platform, {
  onRecord: (accelerator) => void apply(accelerator),
  onPreview: (display) => {
    if (recorder.isRecording()) field.textContent = display || 'Type a shortcut…'
  },
  onProblem: (message) => showStatus(message ?? RECORDING_HINT, message !== null),
  onRecordingChange: (recording) => {
    bridge.setRecording(recording)
    field.classList.toggle('recording', recording)
    if (recording) {
      field.textContent = 'Type a shortcut…'
      showStatus(RECORDING_HINT)
      return
    }
    // Any complaint was about a chord the user has now abandoned. A chord that
    // was accepted overwrites this hint as soon as the main process answers.
    field.textContent = shortcut.display
    showStatus(IDLE_HINT)
  },
})

reset.addEventListener('click', () => {
  recorder.stop()
  void apply(DEFAULT_CAPTURE_SHORTCUT)
})

// Recording is released whenever the window loses focus, so a shortcut typed
// into another app never lands here.
window.addEventListener('blur', () => recorder.stop())

void bridge
  .getShortcut()
  .then(showShortcut)
  .catch((error: unknown) => {
    console.error('Could not read the shortcut.', error)
    showStatus('Chop could not read the current shortcut.', true)
  })
