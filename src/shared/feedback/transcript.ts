/**
 * The note as plain text. One spelling serves three places — the "What's
 * included" disclosure, the Copy text button, and the mailto fallback — so what
 * the user is shown is exactly what leaves the machine.
 */
import type { FeedbackDiagnostics, FeedbackDraft, FeedbackKind } from './types'

const SUBJECTS: Record<FeedbackKind, string> = {
  idea: 'Chop — idea',
  problem: 'Chop — problem',
}

export function feedbackSubject(kind: FeedbackKind): string {
  return SUBJECTS[kind]
}

/** The lines behind "What's included", one fact each. */
export function diagnosticsLines(diagnostics: FeedbackDiagnostics): readonly string[] {
  const displays = diagnostics.displayCount === 1 ? '1 display' : `${diagnostics.displayCount} displays`
  return [
    `Chop ${diagnostics.appVersion}`,
    `${diagnostics.platform} ${diagnostics.osVersion} (${diagnostics.arch})`,
    displays,
    `Licence: ${diagnostics.license}`,
  ]
}

/**
 * The whole note. `diagnostics` is null when the user has turned them off, and
 * nothing about the machine appears in that case.
 */
export function feedbackTranscript(
  draft: FeedbackDraft,
  diagnostics: FeedbackDiagnostics | null,
): string {
  const parts = [feedbackSubject(draft.kind), '', draft.message.trim()]

  if (draft.attachment) parts.push('', '(an image is attached)')
  if (diagnostics) parts.push('', '--', ...diagnosticsLines(diagnostics))

  return parts.join('\n')
}

/**
 * The fallback when the endpoint cannot be reached. `address` is a constant in
 * the bundle, never anything the renderer chose.
 */
export function feedbackMailtoUrl(
  address: string,
  draft: FeedbackDraft,
  diagnostics: FeedbackDiagnostics | null,
): string {
  const subject = encodeURIComponent(feedbackSubject(draft.kind))
  // The subject is already the transcript's first line; the body drops it.
  const body = encodeURIComponent(
    feedbackTranscript(draft, diagnostics).split('\n').slice(2).join('\n'),
  )
  return `mailto:${address}?subject=${subject}&body=${body}`
}
