import { compareVersions, parseVersion } from '@shared/version'

/**
 * Chop's source repo is private, so release metadata lives in a separate public
 * repo. That keeps the update check a plain unauthenticated GET, with no token
 * shipped inside the app.
 */
export const RELEASES_REPO = 'sonnyphamcodelink/chop-releases'

/** Longest the update check may wait before it gives up. */
export const UPDATE_FETCH_TIMEOUT_MS = 8000

export type Release = {
  /** The git tag, e.g. `v0.2.0`. */
  readonly tag: string
  /** Human-facing release page, retained for diagnostics. */
  readonly url: string
  /** Installers attached to this release that passed strict validation. */
  readonly assets: readonly ReleaseAsset[]
}

export type ReleaseAsset = {
  readonly name: string
  readonly url: string
  readonly size: number
  /** Lowercase hexadecimal SHA-256 supplied by GitHub. */
  readonly sha256: string
}

/** Either the newest published release, or why we could not read one. */
export type FeedResult =
  | { readonly ok: true; readonly release: Release }
  | { readonly ok: false; readonly reason: string }

export function releasesFeedUrl(repo: string = RELEASES_REPO): string {
  return `https://api.github.com/repos/${repo}/releases?per_page=100`
}

export function installerAssetName(
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): string | null {
  if (platform !== 'darwin') return null
  if (arch === 'arm64') return 'Chop-mac-arm64.dmg'
  if (arch === 'x64') return 'Chop-mac-x64.dmg'
  return null
}

export function installerAsset(
  release: Release,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): ReleaseAsset | null {
  const expected = installerAssetName(platform, arch)
  if (!expected) return null
  return release.assets.find((asset) => asset.name === expected) ?? null
}

function parseAsset(value: unknown, repo: string): ReleaseAsset | null {
  if (typeof value !== 'object' || value === null) return null
  const {
    name,
    browser_download_url: url,
    size,
    digest,
  } = value as Record<string, unknown>
  const prefix = `https://github.com/${repo}/releases/download/`

  if (typeof name !== 'string' || typeof url !== 'string' || !url.startsWith(prefix)) return null
  if (!Number.isSafeInteger(size) || (size as number) <= 0) return null
  if (typeof digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(digest)) return null

  return { name, url, size: size as number, sha256: digest.slice('sha256:'.length) }
}

/**
 * Returns null for anything that is not a published release in the configured
 * repository. Asset URLs are pinned too because their bytes become executable.
 */
export function parseRelease(payload: unknown, repo: string = RELEASES_REPO): Release | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { tag_name: tag, html_url: url, draft, prerelease, assets } = payload as Record<
    string,
    unknown
  >

  if (typeof tag !== 'string' || tag.trim() === '') return null
  if (typeof url !== 'string' || !url.startsWith(`https://github.com/${repo}/releases/`)) return null
  if (draft === true || prerelease === true) return null
  if (!Array.isArray(assets)) return null

  return {
    tag: tag.trim(),
    url,
    assets: assets.flatMap((asset) => {
      const parsed = parseAsset(asset, repo)
      return parsed ? [parsed] : []
    }),
  }
}

/** GitHub's “latest” flag is not semantic-version aware, so choose the highest tag ourselves. */
export function parseReleaseFeed(payload: unknown, repo: string = RELEASES_REPO): Release | null {
  if (!Array.isArray(payload)) return null

  return payload.reduce<Release | null>((latest, value) => {
    const release = parseRelease(value, repo)
    if (!release) return latest
    const version = parseVersion(release.tag)
    if (!version || version.prerelease.length > 0) return latest
    if (!latest) return release
    const latestVersion = parseVersion(latest.tag)
    return latestVersion && compareVersions(version, latestVersion) > 0 ? release : latest
  }, null)
}
