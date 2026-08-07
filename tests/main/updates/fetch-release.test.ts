import { describe, expect, it } from 'vitest'
import { fetchLatestRelease } from '../../../src/main/updates/fetch-release'

const URL = 'https://api.github.com/repos/owner/repo/releases/latest'

const respondWith = (status: number, body: unknown): typeof fetch =>
  (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response) as unknown as typeof fetch

const published = {
  tag_name: 'v0.2.0',
  html_url: 'https://github.com/owner/repo/releases/tag/v0.2.0',
  draft: false,
  prerelease: false,
}

describe('fetchLatestRelease', () => {
  it('returns the parsed release on success', async () => {
    const result = await fetchLatestRelease(URL, respondWith(200, published))

    expect(result).toEqual({ ok: true, release: { tag: 'v0.2.0', url: published.html_url } })
  })

  it('explains a 404 as no release published yet', async () => {
    const result = await fetchLatestRelease(URL, respondWith(404, { message: 'Not Found' }))

    expect(result).toEqual({ ok: false, reason: 'No release has been published yet.' })
  })

  it('reports the status code for other HTTP failures', async () => {
    const result = await fetchLatestRelease(URL, respondWith(503, {}))

    expect(result).toEqual({ ok: false, reason: 'GitHub answered 503.' })
  })

  it('rejects a well-formed response that is not a usable release', async () => {
    const result = await fetchLatestRelease(URL, respondWith(200, { tag_name: 'v0.2.0' }))

    expect(result).toEqual({
      ok: false,
      reason: 'The release feed was not in the expected shape.',
    })
  })

  it('turns a network error into a result instead of throwing', async () => {
    const failing = (async () => {
      throw new Error('getaddrinfo ENOTFOUND api.github.com')
    }) as unknown as typeof fetch

    await expect(fetchLatestRelease(URL, failing)).resolves.toEqual({
      ok: false,
      reason: 'getaddrinfo ENOTFOUND api.github.com',
    })
  })

  it('sends the request to the URL it was given', async () => {
    const seen: string[] = []
    const recording = (async (url: string) => {
      seen.push(url)
      return { ok: true, status: 200, json: async () => published } as Response
    }) as unknown as typeof fetch

    await fetchLatestRelease(URL, recording)

    expect(seen).toEqual([URL])
  })
})
