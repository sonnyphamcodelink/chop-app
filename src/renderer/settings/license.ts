/**
 * The License pane. Kept apart from `main.ts` so the settings entry point stays
 * a wiring file rather than growing a third feature inline.
 */
import { licenseSummary } from '@shared/license/summary'
import type { ActivationResult, DeactivationResult, LicenseView } from '@shared/license/view'

export type LicenseBridge = {
  getLicense(): Promise<LicenseView>
  activateLicense(key: string): Promise<ActivationResult>
  deactivateLicense(): Promise<DeactivationResult>
  openPurchasePage(): Promise<void>
  onLicenseChanged(listener: (view: LicenseView) => void): void
}

type Elements = {
  readonly state: HTMLElement
  readonly headline: HTMLElement
  readonly detail: HTMLElement
  readonly installed: HTMLElement
  readonly key: HTMLElement
  readonly remove: HTMLButtonElement
  readonly entry: HTMLElement
  readonly input: HTMLTextAreaElement
  readonly activate: HTMLButtonElement
  readonly buy: HTMLButtonElement
  readonly status: HTMLParagraphElement
}

const TONES = ['good', 'warning', 'error'] as const

function render(elements: Elements, view: LicenseView): void {
  const summary = licenseSummary(view.status)

  elements.state.classList.remove(...TONES)
  elements.state.classList.add(summary.tone)
  elements.headline.textContent = summary.headline
  elements.detail.textContent = summary.detail

  elements.installed.hidden = view.maskedKey === null
  elements.key.textContent = view.maskedKey ?? '—'

  // With a good key installed there is nothing left to paste or buy.
  const licensed = view.status.kind === 'licensed'
  elements.entry.hidden = licensed
  if (licensed) elements.input.value = ''
}

function showStatus(elements: Elements, message: string, isError = false): void {
  elements.status.textContent = message
  elements.status.classList.toggle('error', isError)
}

export function initLicensePane(bridge: LicenseBridge): void {
  const elements: Elements = {
    state: document.querySelector<HTMLElement>('#license-state')!,
    headline: document.querySelector<HTMLElement>('#license-headline')!,
    detail: document.querySelector<HTMLElement>('#license-detail')!,
    installed: document.querySelector<HTMLElement>('#license-installed')!,
    key: document.querySelector<HTMLElement>('#license-key')!,
    remove: document.querySelector<HTMLButtonElement>('#license-remove')!,
    entry: document.querySelector<HTMLElement>('#license-entry')!,
    input: document.querySelector<HTMLTextAreaElement>('#license-input')!,
    activate: document.querySelector<HTMLButtonElement>('#license-activate')!,
    buy: document.querySelector<HTMLButtonElement>('#license-buy')!,
    status: document.querySelector<HTMLParagraphElement>('#license-status')!,
  }

  async function activate(): Promise<void> {
    const key = elements.input.value.trim()
    if (!key) {
      showStatus(elements, 'Paste your licence key first.', true)
      return
    }

    elements.activate.disabled = true
    showStatus(elements, 'Checking your key…')
    try {
      const result = await bridge.activateLicense(key)
      render(elements, result.view)
      showStatus(
        elements,
        result.ok ? 'Thank you — Chop is licensed.' : result.error ?? 'That key was not accepted.',
        !result.ok,
      )
    } catch (error) {
      console.error('Could not activate the licence.', error)
      showStatus(elements, 'Chop could not check that key. Try again.', true)
    } finally {
      elements.activate.disabled = false
    }
  }

  async function remove(): Promise<void> {
    // Main asks the user to confirm; a cancelled removal comes back untouched.
    elements.remove.disabled = true
    try {
      const result = await bridge.deactivateLicense()
      render(elements, result.view)
      if (result.removed) showStatus(elements, 'The key was removed from this Mac.')
    } catch (error) {
      console.error('Could not remove the licence.', error)
      showStatus(elements, 'Chop could not remove that key. Try again.', true)
    } finally {
      elements.remove.disabled = false
    }
  }

  elements.activate.addEventListener('click', () => void activate())
  elements.remove.addEventListener('click', () => void remove())
  elements.buy.addEventListener('click', () => {
    void bridge.openPurchasePage().catch((error: unknown) => {
      console.error('Could not open the store.', error)
      showStatus(elements, 'Chop could not open the store in your browser.', true)
    })
  })

  // Enter activates; the field is multi-line only so a long key stays readable.
  elements.input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void activate()
  })

  bridge.onLicenseChanged((view) => render(elements, view))

  void bridge
    .getLicense()
    .then((view) => render(elements, view))
    .catch((error: unknown) => {
      console.error('Could not read the licence.', error)
      elements.headline.textContent = 'Licence unavailable'
      elements.detail.textContent = 'Chop could not read its licence state. Restart and try again.'
    })
}
