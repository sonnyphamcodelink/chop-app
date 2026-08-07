import { describe, expect, it } from 'vitest'
import type { FeedResult } from '../../../src/main/updates/release-feed'
import { updateNotice, updateStatus } from '../../../src/main/updates/update-status'

const feed = (tag: string): FeedResult => ({
  ok: true,
  release: { tag, url: `https://github.com/sonnyphamcodelink/chop-releases/releases/tag/${tag}` },
})

describe('updateStatus', () => {
  it('reports an update when the release is ahead of the running version', () => {
    expect(updateStatus('0.1.0', feed('v0.2.0'))).toEqual({
      kind: 'update-available',
      current: '0.1.0',
      tag: 'v0.2.0',
      url: 'https://github.com/sonnyphamcodelink/chop-releases/releases/tag/v0.2.0',
    })
  })

  it('reports up to date when the release matches the running version', () => {
    expect(updateStatus('0.1.0', feed('v0.1.0'))).toEqual({ kind: 'up-to-date', current: '0.1.0' })
  })

  it('reports up to date when the running version is ahead of the release', () => {
    expect(updateStatus('0.3.0', feed('v0.2.0')).kind).toBe('up-to-date')
  })

  it('does not prompt for a tag it cannot read as a version', () => {
    expect(updateStatus('0.1.0', feed('nightly')).kind).toBe('up-to-date')
  })

  it('passes a feed failure through with its reason', () => {
    expect(updateStatus('0.1.0', { ok: false, reason: 'GitHub answered 500.' })).toEqual({
      kind: 'check-failed',
      reason: 'GitHub answered 500.',
    })
  })
})

describe('updateNotice', () => {
  it('offers a download as the default button when an update exists', () => {
    const notice = updateNotice(updateStatus('0.1.0', feed('v0.2.0')))

    expect(notice.buttons).toEqual(['Download', 'Later'])
    expect(notice.defaultId).toBe(0)
    expect(notice.cancelId).toBe(1)
    expect(notice.message).toContain('v0.2.0')
    expect(notice.detail).toContain('0.1.0')
  })

  it('acknowledges an up-to-date app with a single button', () => {
    const notice = updateNotice(updateStatus('0.1.0', feed('v0.1.0')))

    expect(notice.type).toBe('info')
    expect(notice.buttons).toEqual(['OK'])
    expect(notice.detail).toContain('0.1.0')
  })

  it('surfaces the failure reason rather than swallowing it', () => {
    const notice = updateNotice({ kind: 'check-failed', reason: 'Network unreachable.' })

    expect(notice.type).toBe('warning')
    expect(notice.detail).toBe('Network unreachable.')
    expect(notice.buttons).toEqual(['OK'])
  })
})
