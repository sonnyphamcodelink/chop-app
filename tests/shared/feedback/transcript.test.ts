import { describe, expect, it } from 'vitest'
import {
  diagnosticsLines,
  feedbackMailtoUrl,
  feedbackSubject,
  feedbackTranscript,
} from '../../../src/shared/feedback/transcript'
import type { FeedbackDiagnostics, FeedbackDraft } from '../../../src/shared/feedback/types'

const diagnostics: FeedbackDiagnostics = {
  appVersion: '0.2.0',
  platform: 'darwin',
  osVersion: '25.5.0',
  arch: 'arm64',
  displayCount: 2,
  license: 'trial',
}

const draft: FeedbackDraft = {
  kind: 'problem',
  message: 'Crops are off by a pixel.',
  includeDiagnostics: true,
  attachment: null,
}

describe('diagnosticsLines', () => {
  it('lists the version, system, displays and licence', () => {
    expect(diagnosticsLines(diagnostics)).toEqual([
      'Chop 0.2.0',
      'darwin 25.5.0 (arm64)',
      '2 displays',
      'Licence: trial',
    ])
  })

  it('says one display in the singular', () => {
    expect(diagnosticsLines({ ...diagnostics, displayCount: 1 })).toContain('1 display')
  })
})

describe('feedbackSubject', () => {
  it('names the kind', () => {
    expect(feedbackSubject('idea')).toContain('idea')
    expect(feedbackSubject('problem')).toContain('problem')
  })
})

describe('feedbackTranscript', () => {
  it('leads with the subject and the message', () => {
    const text = feedbackTranscript(draft, null)
    expect(text.startsWith(feedbackSubject('problem'))).toBe(true)
    expect(text).toContain('Crops are off by a pixel.')
  })

  it('says nothing about the machine when diagnostics are off', () => {
    const text = feedbackTranscript(draft, null)
    expect(text).not.toContain('0.2.0')
    expect(text).not.toContain('arm64')
  })

  it('appends every diagnostics line when they are on', () => {
    const text = feedbackTranscript(draft, diagnostics)
    for (const line of diagnosticsLines(diagnostics)) expect(text).toContain(line)
  })

  it('mentions an attachment so the reader knows to look for it', () => {
    const text = feedbackTranscript({ ...draft, attachment: 'data:image/png;base64,AAAA' }, null)
    expect(text).toContain('an image is attached')
  })

  it('does not mention an attachment when there is none', () => {
    expect(feedbackTranscript(draft, null)).not.toContain('attached')
  })
})

describe('feedbackMailtoUrl', () => {
  it('addresses the given mailbox', () => {
    expect(feedbackMailtoUrl('hi@example.com', draft, null)).toContain('mailto:hi@example.com?')
  })

  it('carries the subject and the message', () => {
    const url = new URL(feedbackMailtoUrl('hi@example.com', draft, diagnostics))
    expect(url.searchParams.get('subject')).toBe(feedbackSubject('problem'))
    expect(url.searchParams.get('body')).toContain('Crops are off by a pixel.')
  })

  it('does not repeat the subject inside the body', () => {
    const url = new URL(feedbackMailtoUrl('hi@example.com', draft, null))
    expect(url.searchParams.get('body')).not.toContain(feedbackSubject('problem'))
  })

  it('escapes characters that would otherwise break the URL', () => {
    const awkward = { ...draft, message: 'a&b=c ?d #e' }
    const url = new URL(feedbackMailtoUrl('hi@example.com', awkward, null))
    expect(url.searchParams.get('body')).toBe('a&b=c ?d #e')
  })
})
