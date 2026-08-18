import { describe, expect, it } from 'vitest'
import {
  isSendable,
  MESSAGE_MAX_LENGTH,
  messagePlaceholder,
  messageProblem,
  parseDraft,
} from '../../../src/shared/feedback/draft'
import { isFeedbackKind } from '../../../src/shared/feedback/types'

const draft = {
  kind: 'idea',
  message: 'A filmstrip search box would help.',
  includeDiagnostics: true,
  attachment: null,
}

describe('messageProblem', () => {
  it('asks for words when the box is empty', () => {
    expect(messageProblem('')).toBe('Add a few words first.')
  })

  it('treats whitespace as empty', () => {
    expect(messageProblem('   \n\t ')).toBe('Add a few words first.')
  })

  it('rejects a message longer than the limit', () => {
    const problem = messageProblem('x'.repeat(MESSAGE_MAX_LENGTH + 1))
    expect(problem).toContain(String(MESSAGE_MAX_LENGTH))
  })

  it('accepts a message at exactly the limit', () => {
    expect(messageProblem('x'.repeat(MESSAGE_MAX_LENGTH))).toBeNull()
  })

  it('accepts an ordinary note', () => {
    expect(messageProblem('Crops are off by a pixel.')).toBeNull()
    expect(isSendable('Crops are off by a pixel.')).toBe(true)
  })
})

describe('messagePlaceholder', () => {
  it('asks a different question for each kind', () => {
    expect(messagePlaceholder('idea')).not.toBe(messagePlaceholder('problem'))
  })
})

describe('isFeedbackKind', () => {
  it('accepts the two kinds and nothing else', () => {
    expect(isFeedbackKind('idea')).toBe(true)
    expect(isFeedbackKind('problem')).toBe(true)
    expect(isFeedbackKind('praise')).toBe(false)
    expect(isFeedbackKind(null)).toBe(false)
  })
})

describe('parseDraft', () => {
  it('accepts a well-formed draft and trims the message', () => {
    expect(parseDraft({ ...draft, message: '  Hello  ' })).toEqual({
      kind: 'idea',
      message: 'Hello',
      includeDiagnostics: true,
      attachment: null,
    })
  })

  it('keeps a pasted image through', () => {
    const dataUrl = 'data:image/png;base64,AAAA'
    expect(parseDraft({ ...draft, attachment: dataUrl })?.attachment).toBe(dataUrl)
  })

  it('refuses anything that is not an object', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft('idea')).toBeNull()
  })

  it('refuses an unknown kind', () => {
    expect(parseDraft({ ...draft, kind: 'rant' })).toBeNull()
  })

  it('refuses a message that could not be sent from the pane either', () => {
    expect(parseDraft({ ...draft, message: ' ' })).toBeNull()
    expect(parseDraft({ ...draft, message: 42 })).toBeNull()
  })

  it('refuses a non-boolean diagnostics flag', () => {
    expect(parseDraft({ ...draft, includeDiagnostics: 'yes' })).toBeNull()
  })

  it('refuses an attachment that is not a string or null', () => {
    expect(parseDraft({ ...draft, attachment: 7 })).toBeNull()
  })
})
