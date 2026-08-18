import { describe, expect, it } from 'vitest'
import { CANCEL_BUTTON, SEND_BUTTON, sendFeedbackNotice } from '../../../src/main/feedback/notice'
import type { FeedbackDiagnostics, FeedbackDraft } from '../../../src/shared/feedback/types'

const draft: FeedbackDraft = {
  kind: 'idea',
  message: 'A filmstrip search box would help.',
  includeDiagnostics: true,
  attachment: null,
}

const diagnostics: FeedbackDiagnostics = {
  appVersion: '0.2.0',
  platform: 'darwin',
  osVersion: '25.5.0',
  arch: 'arm64',
  displayCount: 1,
  license: 'trial',
}

describe('sendFeedbackNotice', () => {
  it('offers Send and Cancel, with Send as the default', () => {
    const notice = sendFeedbackNotice(draft, null)
    expect(notice.buttons).toEqual(['Send', 'Cancel'])
    expect(notice.defaultId).toBe(SEND_BUTTON)
    expect(notice.cancelId).toBe(CANCEL_BUTTON)
  })

  it('titles itself after the kind being sent', () => {
    expect(sendFeedbackNotice(draft, null).title).toBe('Send idea')
    expect(sendFeedbackNotice({ ...draft, kind: 'problem' }, null).title).toBe(
      'Send problem report',
    )
  })

  it('lists the message on its own when nothing else is going', () => {
    const notice = sendFeedbackNotice(draft, null)
    expect(notice.detail).toContain('Your message')
    expect(notice.detail).not.toContain('image')
    expect(notice.detail).not.toContain('0.2.0')
  })

  it('names the pasted image, which is the reason to look before sending', () => {
    const notice = sendFeedbackNotice({ ...draft, attachment: 'data:image/png;base64,AAAA' }, null)
    expect(notice.detail).toContain('The image you pasted')
  })

  it('spells out every diagnostics line rather than summarising them', () => {
    const notice = sendFeedbackNotice(draft, diagnostics)
    expect(notice.detail).toContain('Chop 0.2.0')
    expect(notice.detail).toContain('darwin 25.5.0 (arm64)')
    expect(notice.detail).toContain('1 display')
    expect(notice.detail).toContain('Licence: trial')
  })

  it('promises nothing else leaves the Mac', () => {
    expect(sendFeedbackNotice(draft, diagnostics).detail).toContain('Nothing else leaves this Mac')
  })
})
