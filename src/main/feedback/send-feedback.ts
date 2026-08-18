/**
 * Posting the note. Network trouble is a result, not a throw: the pane has to
 * keep what the user typed and offer them the fallbacks, which it cannot do if
 * this takes the send down with it.
 */
import { attachmentFileName, type PastedImage } from '@shared/feedback/attachment'
import type {
  FeedbackDiagnostics,
  FeedbackDraft,
  FeedbackResult,
} from '@shared/feedback/types'
import { FEEDBACK_TIMEOUT_MS, FEEDBACK_URL, isSafeFeedbackUrl } from './endpoint'

export type FeedbackSubmission = {
  readonly draft: FeedbackDraft
  /** Null when the user turned diagnostics off; nothing stands in for them. */
  readonly diagnostics: FeedbackDiagnostics | null
  /** Already checked against the allowed types and the size cap. */
  readonly image: PastedImage | null
}

const UNREACHABLE = 'Chop could not reach the feedback server.'

/** The base64 payload, decoded into the bytes that actually travel. */
function imageBytes(image: PastedImage): Uint8Array<ArrayBuffer> {
  // Copied into a plain view: a Buffer is backed by a shared pool, which is
  // not what Blob will accept.
  return new Uint8Array(Buffer.from(image.dataUrl.split(',')[1] ?? '', 'base64'))
}

function buildBody(submission: FeedbackSubmission): FormData {
  const body = new FormData()
  body.set('kind', submission.draft.kind)
  body.set('message', submission.draft.message)
  if (submission.diagnostics) {
    body.set('diagnostics', JSON.stringify(submission.diagnostics))
  }
  if (submission.image) {
    const { mediaType } = submission.image
    body.set(
      'capture',
      new Blob([imageBytes(submission.image)], { type: mediaType }),
      attachmentFileName(mediaType),
    )
  }
  return body
}

export async function postFeedback(
  submission: FeedbackSubmission,
  url: string = FEEDBACK_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedbackResult> {
  if (!isSafeFeedbackUrl(url)) {
    return { status: 'failed', reason: 'Feedback is not configured in this build.' }
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      body: buildBody(submission),
      signal: AbortSignal.timeout(FEEDBACK_TIMEOUT_MS),
    })

    // A 413 is the one refusal the user can act on themselves.
    if (response.status === 413) {
      return {
        status: 'failed',
        reason: 'That was too large to accept. Try again without the image.',
      }
    }
    if (!response.ok) {
      return { status: 'failed', reason: `The feedback server answered ${response.status}.` }
    }
    return { status: 'sent' }
  } catch {
    // The reason is shown to the user, so it says what to do rather than what
    // the fetch layer called it.
    return { status: 'failed', reason: UNREACHABLE }
  }
}
