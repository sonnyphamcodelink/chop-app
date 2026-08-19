import { describe, expect, it } from 'vitest'
import { postUsage } from '../../../src/main/usage/send-usage'
import type { UsageReport } from '../../../src/main/usage/report'

const URL_OK = 'https://example.com/usage'
const URL_HTTP = 'http://example.com/usage'

const report: UsageReport = {
  schema: 1,
  deviceId: 'abc123',
  idSource: 'hardware',
  day: '2026-08-19',
  since: '2026-08-18T00:00:00.000Z',
  captures: 5,
  imagesSaved: 3,
  imagesCopied: 2,
  license: { kind: 'trial', token: null, trialDaysLeft: 10 },
  appVersion: '1.0.0',
  osVersion: '24.0.0',
  arch: 'arm64',
}

/** Captures the last request so the body can be inspected. */
function recorder(status = 200): {
  fetch: typeof fetch
  lastBody(): UsageReport
} {
  let captured: UsageReport | null = null
  const impl = (async (_url: string, init: RequestInit) => {
    captured = JSON.parse(init.body as string) as UsageReport
    return { ok: status >= 200 && status < 300, status } as Response
  }) as unknown as typeof fetch
  return {
    fetch: impl,
    lastBody: () => captured!,
  }
}

/** A fetch that always throws. */
const throwingFetch = (async () => {
  throw new Error('network error')
}) as unknown as typeof fetch

describe('postUsage', () => {
  it('returns ok: true on a 200', async () => {
    const { fetch } = recorder(200)
    expect(await postUsage(report, URL_OK, fetch)).toEqual({ ok: true })
  })

  it('returns ok: true on any 2xx', async () => {
    const { fetch } = recorder(201)
    expect(await postUsage(report, URL_OK, fetch)).toEqual({ ok: true })
  })

  it('sends the report as JSON', async () => {
    const { fetch, lastBody } = recorder()
    await postUsage(report, URL_OK, fetch)
    expect(lastBody()).toEqual(report)
  })

  it('sends a POST to the given URL', async () => {
    let capturedUrl = ''
    let capturedMethod = ''
    const impl = (async (url: string, init: RequestInit) => {
      capturedUrl = url as string
      capturedMethod = init.method as string
      return { ok: true, status: 200 } as Response
    }) as unknown as typeof fetch
    await postUsage(report, URL_OK, impl)
    expect(capturedUrl).toBe(URL_OK)
    expect(capturedMethod).toBe('POST')
  })

  it('sends Content-Type: application/json', async () => {
    let capturedHeaders: HeadersInit | undefined
    const impl = (async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers
      return { ok: true, status: 200 } as Response
    }) as unknown as typeof fetch
    await postUsage(report, URL_OK, impl)
    expect((capturedHeaders as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('returns ok: false on a 400 and does not throw', async () => {
    const { fetch } = recorder(400)
    expect(await postUsage(report, URL_OK, fetch)).toEqual({ ok: false })
  })

  it('returns ok: false on a 429', async () => {
    const { fetch } = recorder(429)
    expect(await postUsage(report, URL_OK, fetch)).toEqual({ ok: false })
  })

  it('returns ok: false on a 500', async () => {
    const { fetch } = recorder(500)
    expect(await postUsage(report, URL_OK, fetch)).toEqual({ ok: false })
  })

  it('returns ok: false when fetch throws', async () => {
    expect(await postUsage(report, URL_OK, throwingFetch)).toEqual({ ok: false })
  })

  it('refuses to send to a non-https URL', async () => {
    const { fetch } = recorder()
    const result = await postUsage(report, URL_HTTP, fetch)
    expect(result).toEqual({ ok: false })
  })

  it('never throws regardless of fetch behaviour', async () => {
    await expect(postUsage(report, URL_OK, throwingFetch)).resolves.not.toThrow()
  })
})
