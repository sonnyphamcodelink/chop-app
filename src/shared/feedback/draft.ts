/**
 * What counts as a sendable note. Kept here rather than in the pane so the
 * renderer and the main process agree on it without one trusting the other.
 */
import { type FeedbackDraft, type FeedbackKind, isFeedbackKind } from './types'

export const MESSAGE_MIN_LENGTH = 3
export const MESSAGE_MAX_LENGTH = 4000

const PLACEHOLDERS: Record<FeedbackKind, string> = {
  idea: 'What would make Chop better for you?',
  problem: 'What happened, and what did you expect instead?',
}

/** The prompt shown in the empty message box; it changes with the kind. */
export function messagePlaceholder(kind: FeedbackKind): string {
  return PLACEHOLDERS[kind]
}

/**
 * Why a message cannot be sent, ready to show, or null when it can. Send stays
 * enabled either way — a greyed-out button with no explanation is a dead end.
 */
export function messageProblem(message: string): string | null {
  const trimmed = message.trim()
  if (trimmed.length < MESSAGE_MIN_LENGTH) return 'Add a few words first.'
  if (trimmed.length > MESSAGE_MAX_LENGTH) {
    return `That is longer than ${MESSAGE_MAX_LENGTH} characters. Trim it down.`
  }
  return null
}

export function isSendable(message: string): boolean {
  return messageProblem(message) === null
}

/**
 * Narrows whatever arrived over IPC to a draft, or null. The renderer is not
 * trusted to have sent a well-formed one.
 */
export function parseDraft(value: unknown): FeedbackDraft | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  if (!isFeedbackKind(raw.kind)) return null
  if (typeof raw.message !== 'string' || !isSendable(raw.message)) return null
  if (typeof raw.includeDiagnostics !== 'boolean') return null
  if (raw.attachment !== null && typeof raw.attachment !== 'string') return null

  return {
    kind: raw.kind,
    message: raw.message.trim(),
    includeDiagnostics: raw.includeDiagnostics,
    attachment: raw.attachment,
  }
}
