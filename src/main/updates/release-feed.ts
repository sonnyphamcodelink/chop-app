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
  /** Release page to send the user to for the download. */
  readonly url: string
}

/** Either the newest published release, or why we could not read one. */
export type FeedResult =
  | { readonly ok: true; readonly release: Release }
  | { readonly ok: false; readonly reason: string }

export function latestReleaseUrl(repo: string = RELEASES_REPO): string {
  return `https://api.github.com/repos/${repo}/releases/latest`
}

/**
 * Returns null for anything that is not a published release we can link to.
 * The URL is pinned to github.com because it is handed to the system browser.
 */
export function parseRelease(payload: unknown): Release | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { tag_name: tag, html_url: url, draft, prerelease } = payload as Record<string, unknown>

  if (typeof tag !== 'string' || tag.trim() === '') return null
  if (typeof url !== 'string' || !url.startsWith('https://github.com/')) return null
  if (draft === true || prerelease === true) return null

  return { tag: tag.trim(), url }
}
