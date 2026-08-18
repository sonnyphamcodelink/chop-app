import { describe, expect, it } from 'vitest'
import {
  installerAsset,
  installerAssetName,
  parseRelease,
  parseReleaseFeed,
  RELEASES_REPO,
  releasesFeedUrl,
} from '../../../src/main/updates/release-feed'

const arm64Asset = {
  name: 'Chop-mac-arm64.dmg',
  browser_download_url:
    'https://github.com/sonnyphamcodelink/chop-releases/releases/download/v0.2.0/Chop-mac-arm64.dmg',
  size: 120_000_000,
  digest: `sha256:${'a'.repeat(64)}`,
}

const published = {
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/sonnyphamcodelink/chop-releases/releases/tag/v0.2.0',
  draft: false,
  prerelease: false,
  assets: [arm64Asset],
}

describe('releasesFeedUrl', () => {
  it('points at the public releases repo by default', () => {
    expect(releasesFeedUrl()).toBe(
      `https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=100`,
    )
  })
})

describe('parseReleaseFeed', () => {
  it('chooses the highest stable version instead of trusting GitHub release ordering', () => {
    const latest = parseReleaseFeed([
      { ...published, tag_name: 'v0.1.0' },
      { ...published, tag_name: 'v0.3.0-beta.1' },
      { ...published, tag_name: 'v0.2.0' },
    ])

    expect(latest?.tag).toBe('v0.2.0')
  })

  it('rejects an envelope instead of treating it as a release list', () => {
    expect(parseReleaseFeed({ message: 'Not Found' })).toBeNull()
  })
})

describe('parseRelease', () => {
  it('reads the tag, release page, and verified installer metadata', () => {
    expect(parseRelease(published)).toEqual({
      tag: 'v0.2.0',
      url: published.html_url,
      assets: [
        {
          name: arm64Asset.name,
          url: arm64Asset.browser_download_url,
          size: arm64Asset.size,
          sha256: 'a'.repeat(64),
        },
      ],
    })
  })

  it('trims whitespace from the tag', () => {
    expect(parseRelease({ ...published, tag_name: ' v0.2.0 ' })?.tag).toBe('v0.2.0')
  })

  it('rejects drafts and prereleases', () => {
    expect(parseRelease({ ...published, draft: true })).toBeNull()
    expect(parseRelease({ ...published, prerelease: true })).toBeNull()
  })

  it('rejects a release URL outside the configured repository', () => {
    expect(parseRelease({ ...published, html_url: 'https://evil.example/releases' })).toBeNull()
    expect(parseRelease({ ...published, html_url: 'http://github.com/x/y' })).toBeNull()
  })

  it('drops assets without a trusted URL, size, or SHA-256 digest', () => {
    const parsed = parseRelease({
      ...published,
      assets: [
        { ...arm64Asset, browser_download_url: 'https://evil.example/Chop.dmg' },
        { ...arm64Asset, size: 0 },
        { ...arm64Asset, digest: null },
      ],
    })

    expect(parsed?.assets).toEqual([])
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

describe('installerAsset', () => {
  it('maps supported Mac architectures to stable release filenames', () => {
    expect(installerAssetName('darwin', 'arm64')).toBe('Chop-mac-arm64.dmg')
    expect(installerAssetName('darwin', 'x64')).toBe('Chop-mac-x64.dmg')
    expect(installerAssetName('win32', 'x64')).toBeNull()
  })

  it('selects only the asset for the running architecture', () => {
    const release = parseRelease(published)
    expect(release && installerAsset(release, 'darwin', 'arm64')?.name).toBe(
      'Chop-mac-arm64.dmg',
    )
    expect(release && installerAsset(release, 'darwin', 'x64')).toBeNull()
  })
})
