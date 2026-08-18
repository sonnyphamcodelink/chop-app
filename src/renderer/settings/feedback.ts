/**
 * The Feedback pane. Kept apart from `main.ts` so the settings entry point
 * stays a wiring file, the same way the License pane is.
 *
 * One rule shapes the whole thing: what the user typed never disappears until
 * it has actually been sent. Chop is offline-first, so a failed send is normal,
 * and it has to leave them holding their words rather than an empty box.
 */
import {
  ATTACHMENT_MAX_BYTES,
  formatBytes,
  parsePastedImage,
  type PastedImage,
} from '@shared/feedback/attachment'
import { isSendable, messagePlaceholder, messageProblem } from '@shared/feedback/draft'
import { diagnosticsLines, feedbackTranscript } from '@shared/feedback/transcript'
import type {
  FeedbackContext,
  FeedbackDraft,
  FeedbackKind,
  FeedbackResult,
} from '@shared/feedback/types'

export type FeedbackBridge = {
  getFeedbackContext(): Promise<FeedbackContext>
  sendFeedback(draft: FeedbackDraft): Promise<FeedbackResult>
  emailFeedback(draft: FeedbackDraft): Promise<boolean>
}

type Elements = {
  readonly form: HTMLElement
  readonly kind: HTMLElement
  readonly message: HTMLTextAreaElement
  readonly pasteHint: HTMLElement
  readonly image: HTMLElement
  readonly thumb: HTMLImageElement
  readonly imageDetail: HTMLElement
  readonly imageRemove: HTMLButtonElement
  readonly diagnostics: HTMLInputElement
  readonly included: HTMLDetailsElement
  readonly includedList: HTMLUListElement
  readonly send: HTMLButtonElement
  readonly copy: HTMLButtonElement
  readonly email: HTMLButtonElement
  readonly status: HTMLParagraphElement
  readonly sent: HTMLElement
  readonly again: HTMLButtonElement
  readonly note: HTMLElement
}

const DRAFT_KEY = 'chop.feedback.draft'
const IDLE_HINT = 'Sent straight to the developer. No account needed.'
const IMAGE_REFUSED =
  `That image could not be attached. Chop takes a PNG, JPEG, GIF or WebP under ${formatBytes(ATTACHMENT_MAX_BYTES)}.`

type Draft = { readonly kind: FeedbackKind; readonly message: string }

/**
 * A draft outlives the window, which is closed and rebuilt on every visit.
 * The pasted image is deliberately left out: megabytes of data URL would eat
 * the storage quota, and losing an image is cheaper than losing the words.
 */
function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed.kind !== 'idea' && parsed.kind !== 'problem') return null
    if (typeof parsed.message !== 'string') return null
    return { kind: parsed.kind, message: parsed.message }
  } catch {
    return null
  }
}

function writeDraft(draft: Draft | null): void {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    // A pane that cannot cache a draft still works; there is nothing to say.
  }
}

/** The first image on the clipboard, as a data URL, or null. */
function readPastedImage(data: DataTransfer | null): Promise<string | null> {
  const file = [...(data?.items ?? [])]
    .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
    ?.getAsFile()
  if (!file) return Promise.resolve(null)

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export function initFeedbackPane(bridge: FeedbackBridge): void {
  const elements: Elements = {
    form: document.querySelector<HTMLElement>('#feedback-form')!,
    kind: document.querySelector<HTMLElement>('#feedback-kind')!,
    message: document.querySelector<HTMLTextAreaElement>('#feedback-message')!,
    pasteHint: document.querySelector<HTMLElement>('#feedback-paste-hint')!,
    image: document.querySelector<HTMLElement>('#feedback-image')!,
    thumb: document.querySelector<HTMLImageElement>('#feedback-thumb')!,
    imageDetail: document.querySelector<HTMLElement>('#feedback-image-detail')!,
    imageRemove: document.querySelector<HTMLButtonElement>('#feedback-image-remove')!,
    diagnostics: document.querySelector<HTMLInputElement>('#feedback-diagnostics')!,
    included: document.querySelector<HTMLDetailsElement>('#feedback-included')!,
    includedList: document.querySelector<HTMLUListElement>('#feedback-included-list')!,
    send: document.querySelector<HTMLButtonElement>('#feedback-send')!,
    copy: document.querySelector<HTMLButtonElement>('#feedback-copy')!,
    email: document.querySelector<HTMLButtonElement>('#feedback-email')!,
    status: document.querySelector<HTMLParagraphElement>('#feedback-status')!,
    sent: document.querySelector<HTMLElement>('#feedback-sent')!,
    again: document.querySelector<HTMLButtonElement>('#feedback-again')!,
    note: document.querySelector<HTMLElement>('#feedback-note')!,
  }

  const kindButtons = elements.kind.querySelectorAll<HTMLButtonElement>('[data-kind]')

  let context: FeedbackContext | null = null
  let kind: FeedbackKind = 'idea'
  let image: PastedImage | null = null
  let sending = false

  function showStatus(message: string, isError = false): void {
    elements.status.textContent = message
    elements.status.classList.toggle('error', isError)
  }

  /** Copy and Email only appear once a send has actually failed. */
  function showFallbacks(offer: boolean): void {
    elements.copy.hidden = !offer
    elements.email.hidden = !offer
  }

  function showKind(next: FeedbackKind): void {
    kind = next
    for (const button of kindButtons) {
      button.setAttribute('aria-checked', button.dataset.kind === next ? 'true' : 'false')
    }
    elements.message.placeholder = messagePlaceholder(next)
    writeDraft({ kind: next, message: elements.message.value })
  }

  function showImage(next: PastedImage | null): void {
    image = next
    elements.image.hidden = next === null
    // The hint has done its job once something is attached.
    elements.pasteHint.hidden = next !== null
    if (!next) return
    elements.thumb.src = next.dataUrl
    elements.imageDetail.textContent =
      `${next.mediaType.replace('image/', '').toUpperCase()} · ${formatBytes(next.byteLength)}`
  }

  function currentDraft(): FeedbackDraft {
    return {
      kind,
      message: elements.message.value.trim(),
      includeDiagnostics: elements.diagnostics.checked,
      attachment: image?.dataUrl ?? null,
    }
  }

  function showContext(next: FeedbackContext): void {
    context = next
    elements.includedList.replaceChildren(
      ...diagnosticsLines(next.diagnostics).map((line) => {
        const item = document.createElement('li')
        item.textContent = line
        return item
      }),
    )
  }

  function reset(): void {
    elements.message.value = ''
    showImage(null)
    elements.sent.hidden = true
    elements.form.hidden = false
    elements.note.hidden = false
    showFallbacks(false)
    showStatus(IDLE_HINT)
    elements.message.focus()
  }

  async function send(): Promise<void> {
    if (sending) return

    const problem = messageProblem(elements.message.value)
    if (problem) {
      showStatus(problem, true)
      elements.message.focus()
      return
    }

    sending = true
    elements.send.disabled = true
    showFallbacks(false)
    // Main puts a confirmation sheet up first, so this reads as a pause rather
    // than as work already under way.
    showStatus('Confirm the send…')

    try {
      const result = await bridge.sendFeedback(currentDraft())
      if (result.status === 'sent') {
        // The only point the draft is safe to drop.
        writeDraft(null)
        elements.form.hidden = true
        elements.sent.hidden = false
        // The note is about the image, which there is no longer one to send.
        elements.note.hidden = true
        return
      }
      if (result.status === 'cancelled') {
        // Backing out is not a failure and must not be dressed up as one.
        showStatus(IDLE_HINT)
        return
      }
      showStatus(`${result.reason} Your note is still here — try again, or send it yourself.`, true)
      showFallbacks(true)
    } catch (error) {
      console.error('Could not send the feedback.', error)
      showStatus('Chop could not send that. Your note is still here — try again, or send it yourself.', true)
      showFallbacks(true)
    } finally {
      sending = false
      elements.send.disabled = false
    }
  }

  /**
   * The fallbacks appear after a failed send, by which point the message was
   * valid — but nothing stops the user emptying the box before reaching for
   * one, and a button that quietly does nothing is worse than the failure.
   */
  function blockedByEmptyMessage(): boolean {
    const problem = messageProblem(elements.message.value)
    if (!problem) return false
    showStatus(problem, true)
    elements.message.focus()
    return true
  }

  async function copyToClipboard(): Promise<void> {
    if (blockedByEmptyMessage()) return
    const diagnostics = elements.diagnostics.checked ? context?.diagnostics ?? null : null
    try {
      await navigator.clipboard.writeText(feedbackTranscript(currentDraft(), diagnostics))
      showStatus('Copied. Paste it wherever suits you.')
    } catch (error) {
      console.error('Could not copy the feedback.', error)
      showStatus('Chop could not reach the clipboard. Select the text and copy it.', true)
    }
  }

  for (const button of kindButtons) {
    button.addEventListener('click', () => {
      const next = button.dataset.kind
      if (next === 'idea' || next === 'problem') showKind(next)
    })
  }

  // An image on the clipboard becomes the attachment; text carries on into the
  // box as normal.
  elements.message.addEventListener('paste', (event) => {
    const clipboard = (event as ClipboardEvent).clipboardData
    if (![...(clipboard?.items ?? [])].some((item) => item.type.startsWith('image/'))) return
    event.preventDefault()

    void readPastedImage(clipboard).then((dataUrl) => {
      const parsed = dataUrl ? parsePastedImage(dataUrl) : null
      if (!parsed) {
        showStatus(IMAGE_REFUSED, true)
        return
      }
      showImage(parsed)
      showStatus(IDLE_HINT)
    })
  })

  elements.imageRemove.addEventListener('click', () => {
    showImage(null)
    elements.message.focus()
  })

  elements.message.addEventListener('input', () => {
    writeDraft({ kind, message: elements.message.value })
    // A complaint about an empty box is stale the moment they start typing.
    if (elements.status.classList.contains('error') && isSendable(elements.message.value)) {
      showStatus(IDLE_HINT)
    }
  })

  // ⌘Enter sends; plain Enter belongs to the paragraph they are writing.
  elements.message.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    void send()
  })

  elements.send.addEventListener('click', () => void send())
  elements.copy.addEventListener('click', () => void copyToClipboard())
  elements.email.addEventListener('click', () => {
    if (blockedByEmptyMessage()) return
    void bridge
      .emailFeedback(currentDraft())
      .then((opened) => {
        if (!opened) showStatus('Chop could not open your mail app. Copy the text instead.', true)
      })
      .catch((error: unknown) => {
        console.error('Could not open the mail client.', error)
        showStatus('Chop could not open your mail app. Copy the text instead.', true)
      })
  })
  elements.again.addEventListener('click', reset)

  // Clicking away from an open disclosure should close it, since it floats
  // over the controls beneath.
  document.addEventListener('click', (event) => {
    if (!elements.included.open) return
    if (!elements.included.contains(event.target as Node)) elements.included.open = false
  })

  const draft = readDraft()
  showKind(draft?.kind ?? 'idea')
  if (draft) elements.message.value = draft.message
  showStatus(IDLE_HINT)

  void bridge
    .getFeedbackContext()
    .then(showContext)
    .catch((error: unknown) => {
      console.error('Could not read the feedback context.', error)
      // The note itself still sends; only the extras are unavailable.
      elements.diagnostics.checked = false
      elements.included.hidden = true
    })
}
