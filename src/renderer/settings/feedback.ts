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
  attachmentProblem,
  formatBytes,
  MAX_ATTACHMENTS,
  parsePastedImage,
  type PastedImage,
  RAW_PASTE_MAX_BYTES,
  totalBytes,
} from '@shared/feedback/attachment'
import { compressPastedImage } from './image-compress'
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
  readonly images: HTMLElement
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
const PASTE_HINT = 'Paste a screenshot straight into the box to send it along.'
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
    images: document.querySelector<HTMLElement>('#feedback-images')!,
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
  let images: PastedImage[] = []
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

  /** One thumbnail per pasted image, each able to take itself back off. */
  function showImages(next: readonly PastedImage[]): void {
    images = [...next]
    elements.images.hidden = images.length === 0

    elements.images.replaceChildren(
      ...images.map((item, index) => {
        const figure = document.createElement('div')
        figure.className = 'thumb'

        const preview = document.createElement('img')
        preview.src = item.dataUrl
        preview.alt = `Pasted image ${index + 1}`

        const remove = document.createElement('button')
        remove.type = 'button'
        remove.textContent = '×'
        remove.setAttribute('aria-label', `Remove image ${index + 1}`)
        remove.addEventListener('click', () => {
          showImages(images.filter((_, at) => at !== index))
          elements.message.focus()
        })

        figure.append(preview, remove)
        return figure
      }),
    )

    // The hint doubles as the count, so the size going up is never a surprise.
    if (images.length === 0) {
      elements.pasteHint.textContent = PASTE_HINT
      return
    }
    const size = formatBytes(totalBytes(images))
    const noun = images.length === 1 ? '1 image' : `${images.length} images`
    elements.pasteHint.textContent =
      images.length < MAX_ATTACHMENTS
        ? `${noun} attached · ${size}. You can paste ${MAX_ATTACHMENTS - images.length} more.`
        : `${noun} attached · ${size}. That is the limit.`
  }

  function currentDraft(): FeedbackDraft {
    return {
      kind,
      message: elements.message.value.trim(),
      includeDiagnostics: elements.diagnostics.checked,
      attachments: images.map((item) => item.dataUrl),
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
    showImages([])
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
        // The note is about the images, which there are no longer any to send.
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
   * A pasted image, shrunk and then measured. The size caps are applied to the
   * reduced version, so a screenshot too large to send as it arrived usually
   * still fits once it has been through the canvas.
   */
  async function attach(clipboard: DataTransfer | null): Promise<void> {
    const dataUrl = await readPastedImage(clipboard)
    // Loose gate first: the right kind of thing, and not so vast that opening
    // it would stall the window.
    const raw = dataUrl ? parsePastedImage(dataUrl, RAW_PASTE_MAX_BYTES) : null
    if (!raw) {
      showStatus(IMAGE_REFUSED, true)
      return
    }

    const reduced = await compressPastedImage(raw)
    // Strict gate second, against what will actually be sent.
    const parsed = parsePastedImage(reduced.dataUrl)
    if (!parsed) {
      showStatus(IMAGE_REFUSED, true)
      return
    }

    // A perfectly good image can still be the one too many.
    const problem = attachmentProblem(images, parsed)
    if (problem) {
      showStatus(problem, true)
      return
    }

    showImages([...images, parsed])
    showStatus(IDLE_HINT)
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

    showStatus('Preparing the image…')
    void attach(clipboard).catch((error: unknown) => {
      console.error('Could not attach the pasted image.', error)
      showStatus(IMAGE_REFUSED, true)
    })
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
