/**
 * The confirmation shown before a note leaves the machine. Pure and
 * dependency-free, the way `license/notice.ts` keeps its own, so the wording
 * can be asserted without a window.
 *
 * It earns its place by listing what is actually going: a pasted image can hold
 * anything that was on screen, and this is the last point anyone can look.
 */
import { diagnosticsLines } from '@shared/feedback/transcript'
import type { FeedbackDiagnostics, FeedbackDraft } from '@shared/feedback/types'

/** Structural match for Electron's MessageBoxOptions. */
export type FeedbackNotice = {
  readonly type: 'info' | 'warning'
  readonly title: string
  readonly message: string
  readonly detail: string
  readonly buttons: readonly string[]
  readonly defaultId: number
  readonly cancelId: number
}

export const SEND_BUTTON = 0
export const CANCEL_BUTTON = 1

const TITLES: Record<FeedbackDraft['kind'], string> = {
  idea: 'Send idea',
  problem: 'Send problem report',
}

export function sendFeedbackNotice(
  draft: FeedbackDraft,
  diagnostics: FeedbackDiagnostics | null,
): FeedbackNotice {
  const going = ['Your message']
  const count = draft.attachments.length
  if (count > 0) going.push(count === 1 ? 'The image you pasted' : `The ${count} images you pasted`)
  if (diagnostics) going.push(...diagnosticsLines(diagnostics))

  return {
    type: 'info',
    title: TITLES[draft.kind],
    message: 'Send this to the Chop developer?',
    detail: `${going.map((line) => `• ${line}`).join('\n')}\n\nNothing else leaves this Mac.`,
    buttons: ['Send', 'Cancel'],
    // Sending is the default: the user pressed Send to get here, and this is a
    // last look rather than a challenge.
    defaultId: SEND_BUTTON,
    cancelId: CANCEL_BUTTON,
  }
}
