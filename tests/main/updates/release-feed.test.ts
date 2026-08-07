import { describe, expect, it } from 'vitest'
import {
  latestReleaseUrl,
  parseRelease,
  RELEASES_REPO,
} from '../../../src/main/updates/release-feed'

const published = {
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/sonnyphamcodelink/chop-releases/releases/tag/v0.2.0',
  draft: false,
  prerelease: false,
}

describe('latestReleaseUrl', () => {
  it('points at the public releases repo by default', () => {
    expect(latestReleaseUrl()).toBe(
      `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`,
    )
  })
})

describe('parseRelease', () => {
  it('reads the tag and release page from a published release', () => {
    expect(parseRelease(published)).toEqual({ tag: 'v0.2.0', url: published.html_url })
  })

  it('trims whitespace from the tag', () => {
    expect(parseRelease({ ...published, tag_name: ' v0.2.0 ' })?.tag).toBe('v0.2.0')
  })

  it('rejects drafts and prereleases', () => {
    expect(parseRelease({ ...published, draft: true })).toBeNull()
    expect(parseRelease({ ...published, prerelease: true })).toBeNull()
  })

  it('rejects a download URL that is not on github.com', () => {
    expect(parseRelease({ ...published, html_url: 'https://evil.example/releases' })).toBeNull()
    expect(parseRelease({ ...published, html_url: 'http://github.com/x/y' })).toBeNull()
  })

  it.each([
    ['a missing tag', { ...published, tag_name: undefined }],
    ['an empty tag', { ...published, tag_name: '  ' }],
    ['a non-string tag', { ...published, tag_name: 42 }],
    ['a missing URL', { ...published, html_url: undefined }],
    ['a GitHub error envelope', { message: 'Not Found' }],
  ])('returns null for %s', (_label, payload) => {
    expect(parseRelease(payload)).toBeNull()
  })

  it.each([null, undefined, 'a string', 7])('returns null for the non-object %o', (payload) => {
    expect(parseRelease(payload)).toBeNull()
  })
})
