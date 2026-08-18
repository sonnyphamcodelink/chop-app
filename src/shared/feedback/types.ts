/**
 * What crosses the IPC boundary about feedback. Types only: the renderer
 * collects the note, the main process decides what is actually sent.
 */

export type FeedbackKind = 'idea' | 'problem'

export const FEEDBACK_KINDS = ['idea', 'problem'] as const

export function isFeedbackKind(value: unknown): value is FeedbackKind {
  return FEEDBACK_KINDS.some((kind) => kind === value)
}

/**
 * Everything Chop would say about itself, gathered in one place so the
 * "What's included" disclosure can show the user exactly what is sent.
 */
export type FeedbackDiagnostics = {
  readonly appVersion: string
  readonly platform: string
  readonly osVersion: string
  readonly arch: string
  readonly displayCount: number
  /** The licence *kind* only — never the key, never the buyer's email. */
  readonly license: string
}

/** What the pane needs to draw itself when it opens. */
export type FeedbackContext = {
  readonly diagnostics: FeedbackDiagnostics
}

/** What the renderer hands to main when Send is pressed. */
export type FeedbackDraft = {
  readonly kind: FeedbackKind
  readonly message: string
  readonly includeDiagnostics: boolean
  /**
   * Pasted images as data URLs, newest last, capped at MAX_ATTACHMENTS. They
   * come from the clipboard rather than from disk, so there is no file for main
   * to read on its own.
   */
  readonly attachments: readonly string[]
}

/**
 * Answer to a send. Cancelling at the confirmation is its own outcome: it is
 * not a failure, and the pane must not dress it up as one.
 */
export type FeedbackResult =
  | { readonly status: 'sent' }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly reason: string }
