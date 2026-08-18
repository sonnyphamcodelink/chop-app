import {
  type FeedResult,
  parseReleaseFeed,
  releasesFeedUrl,
  UPDATE_FETCH_TIMEOUT_MS,
} from './release-feed'

/**
 * Reads the newest published release. Network trouble is a result, not a throw:
 * a failed update check must never be able to take the app down with it.
 */
export async function fetchLatestRelease(
  url: string = releasesFeedUrl(),
  fetchImpl: typeof fetch = fetch,
): Promise<FeedResult> {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(UPDATE_FETCH_TIMEOUT_MS),
    })

    if (response.status === 404) {
      return { ok: false, reason: 'No release has been published yet.' }
    }
    if (!response.ok) {
      return { ok: false, reason: `GitHub answered ${response.status}.` }
    }

    const payload = await response.json()
    if (Array.isArray(payload) && payload.length === 0) {
      return { ok: false, reason: 'No release has been published yet.' }
    }
    const release = parseReleaseFeed(payload)
    if (!release) {
      return { ok: false, reason: 'The release feed was not in the expected shape.' }
    }
    return { ok: true, release }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { ok: false, reason }
  }
}
