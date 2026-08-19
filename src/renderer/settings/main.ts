import { DEFAULT_CAPTURE_SHORTCUT } from '@shared/accelerator'
import {
  isSettingsPane,
  type LoginItemState,
  SETTINGS_PANES,
  type SettingsPane,
  type ShortcutInfo,
  type ShortcutUpdate,
} from '@shared/ipc'
import { initFeedbackPane, type FeedbackBridge } from './feedback'
import { initLicensePane, type LicenseBridge } from './license'
import { createRecorder } from './recorder'
import type { BackgroundUpdateState } from '@shared/update'

type SettingsBridge = LicenseBridge & FeedbackBridge & {
  platform: string
  getShortcut(): Promise<ShortcutInfo>
  setShortcut(accelerator: string): Promise<ShortcutUpdate>
  setRecording(recording: boolean): void
  getOpenAtLogin(): Promise<LoginItemState>
  setOpenAtLogin(enabled: boolean): Promise<LoginItemState>
  onShowPane(listener: (pane: SettingsPane) => void): void
  getUpdateState(): Promise<BackgroundUpdateState>
  relaunchToUpdate(): Promise<boolean>
  onUpdateStateChanged(listener: (state: BackgroundUpdateState) => void): void
  getUsageEnabled(): Promise<boolean>
  setUsageEnabled(enabled: boolean): Promise<boolean>
}

const bridge = (window as unknown as { chopSettings: SettingsBridge }).chopSettings

const navButtons = document.querySelectorAll<HTMLButtonElement>('nav [data-pane]')
const panes = new Map<SettingsPane, HTMLElement>(
  SETTINGS_PANES.map((pane) => [pane, document.querySelector<HTMLElement>(`#pane-${pane}`)!]),
)

function showPane(id: SettingsPane): void {
  for (const button of navButtons) {
    button.setAttribute('aria-current', button.dataset.pane === id ? 'page' : 'false')
  }
  for (const [pane, section] of panes) section.classList.toggle('active', pane === id)
}

for (const button of navButtons) {
  button.addEventListener('click', () => {
    const id = button.dataset.pane
    if (isSettingsPane(id)) showPane(id)
  })
}

// Main asks for a pane when it sends the user here, e.g. after a refused capture.
bridge.onShowPane(showPane)

const updateCard = document.querySelector<HTMLButtonElement>('#update-ready')!
const updateVersion = document.querySelector<HTMLElement>('#update-version')!

function showUpdateState(update: BackgroundUpdateState): void {
  const ready = update.phase === 'ready'
  updateCard.hidden = !ready
  updateCard.disabled = false
  if (ready) updateVersion.textContent = update.tag.replace(/^v/, '')
}

updateCard.addEventListener('click', () => {
  updateCard.disabled = true
  void bridge
    .relaunchToUpdate()
    .then((started) => {
      if (!started) updateCard.disabled = false
    })
    .catch((error: unknown) => {
      console.error('Could not relaunch to update.', error)
      updateCard.disabled = false
    })
})
bridge.onUpdateStateChanged(showUpdateState)
void bridge.getUpdateState().then(showUpdateState).catch(console.error)

initLicensePane(bridge)
initFeedbackPane(bridge)

const loginRow = document.querySelector<HTMLElement>('#login-row')!
const loginNote = document.querySelector<HTMLParagraphElement>('#login-note')!
const loginSwitch = document.querySelector<HTMLInputElement>('#open-at-login')!

function applyLoginState(state: LoginItemState): void {
  if (state === 'unsupported') {
    loginSwitch.checked = false
    loginSwitch.disabled = true
    loginRow.hidden = true
    loginNote.hidden = false
    return
  }
  loginRow.hidden = false
  loginNote.hidden = true
  loginSwitch.disabled = false
  loginSwitch.checked = state === 'enabled'
}

loginSwitch.addEventListener('change', () => {
  void bridge
    .setOpenAtLogin(loginSwitch.checked)
    .then(applyLoginState)
    .catch((error: unknown) => {
      console.error('Could not change Open at Login.', error)
      void bridge.getOpenAtLogin().then(applyLoginState)
    })
})

void bridge
  .getOpenAtLogin()
  .then(applyLoginState)
  .catch((error: unknown) => {
    console.error('Could not read Open at Login.', error)
    applyLoginState('unsupported')
  })

// ---------------------------------------------------------------------------
// Usage reporting switch
// ---------------------------------------------------------------------------

const usageSwitch = document.querySelector<HTMLInputElement>('#usage-enabled')!

usageSwitch.addEventListener('change', () => {
  void bridge
    .setUsageEnabled(usageSwitch.checked)
    .then((enabled) => {
      usageSwitch.checked = enabled
    })
    .catch((error: unknown) => {
      console.error('Could not change usage reporting setting.', error)
      // Revert the checkbox to match the actual stored value.
      void bridge.getUsageEnabled().then((enabled) => {
        usageSwitch.checked = enabled
      })
    })
})

void bridge
  .getUsageEnabled()
  .then((enabled) => {
    usageSwitch.checked = enabled
  })
  .catch((error: unknown) => {
    console.error('Could not read usage reporting setting.', error)
    usageSwitch.checked = true // default on
  })

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
