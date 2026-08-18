import { describe, expect, it } from 'vitest'
import { parsePastedImage } from '../../../src/shared/feedback/attachment'
import { postFeedback } from '../../../src/main/feedback/send-feedback'
import type { FeedbackDiagnostics, FeedbackDraft } from '../../../src/shared/feedback/types'

const URL_OK = 'https://example.com/feedback'

// A one-pixel PNG, the same one the storage tests use.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`

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
  license: 'licensed',
}

/** Captures the request so the body can be inspected. */
function recorder(status = 200): { fetch: typeof fetch; body(): FormData } {
  let captured: FormData | null = null
  const impl = (async (_url: string, init: RequestInit) => {
    captured = init.body as FormData
    return { ok: status >= 200 && status < 300, status } as Response
  }) as unknown as typeof fetch
  return { fetch: impl, body: () => captured! }
}

describe('postFeedback', () => {
  it('reports a send on a 2xx', async () => {
    const { fetch } = recorder()
    expect(await postFeedback({ draft, diagnostics, image: null }, URL_OK, fetch)).toEqual({
      status: 'sent',
    })
  })

  it('sends the kind and the message', async () => {
    const { fetch, body } = recorder()
    await postFeedback({ draft, diagnostics: null, image: null }, URL_OK, fetch)

    expect(body().get('kind')).toBe('idea')
    expect(body().get('message')).toBe('A filmstrip search box would help.')
  })

  it('omits diagnostics entirely when the user turned them off', async () => {
    const { fetch, body } = recorder()
    await postFeedback({ draft, diagnostics: null, image: null }, URL_OK, fetch)

    expect(body().has('diagnostics')).toBe(false)
  })

  it('sends diagnostics as JSON when they are on', async () => {
    const { fetch, body } = recorder()
    await postFeedback({ draft, diagnostics, image: null }, URL_OK, fetch)

    expect(JSON.parse(String(body().get('diagnostics')))).toEqual(diagnostics)
  })

  it('attaches the pasted image, decoded, under a name of its own', async () => {
    const { fetch, body } = recorder()
    const image = parsePastedImage(PNG_DATA_URL)!
    await postFeedback({ draft, diagnostics: null, image }, URL_OK, fetch)

    const file = body().get('capture') as File
    expect(file.name).toBe('pasted-image.png')
    expect(file.type).toBe('image/png')
    // Decoded bytes, not the base64 text that arrived.
    expect(file.size).toBe(Buffer.from(PNG_BASE64, 'base64').byteLength)
  })

  it('names a JPEG by its own type', async () => {
    const { fetch, body } = recorder()
    const image = parsePastedImage(`data:image/jpeg;base64,${PNG_BASE64}`)!
    await postFeedback({ draft, diagnostics: null, image }, URL_OK, fetch)

    expect((body().get('capture') as File).name).toBe('pasted-image.jpg')
  })

  it('sends nothing under capture when nothing was pasted', async () => {
    const { fetch, body } = recorder()
    await postFeedback({ draft, diagnostics: null, image: null }, URL_OK, fetch)

    expect(body().has('capture')).toBe(false)
  })

  it('tells the user to drop the image when the server refuses the size', async () => {
    const { fetch } = recorder(413)
    const result = await postFeedback({ draft, diagnostics, image: null }, URL_OK, fetch)

    expect(result).toEqual({
      status: 'failed',
      reason: 'That was too large to accept. Try again without the image.',
    })
  })

  it('reports any other refusal with its status', async () => {
    const { fetch } = recorder(500)
    const result = await postFeedback({ draft, diagnostics, image: null }, URL_OK, fetch)

    expect(result).toEqual({ status: 'failed', reason: 'The feedback server answered 500.' })
  })

  it('turns a network failure into a result rather than a throw', async () => {
    const failing = (async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }) as unknown as typeof fetch

    const result = await postFeedback({ draft, diagnostics, image: null }, URL_OK, failing)
    expect(result.status).toBe('failed')
  })

  it('refuses to post anywhere that is not https', async () => {
    const { fetch } = recorder()
    const result = await postFeedback(
      { draft, diagnostics, image: null },
      'http://example.com/feedback',
      fetch,
    )

    expect(result).toEqual({
      status: 'failed',
      reason: 'Feedback is not configured in this build.',
    })
  })
})
