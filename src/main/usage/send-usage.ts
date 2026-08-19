/**
 * Sends a usage report to the API.
 *
 * Mirrors `send-feedback.ts` in shape: network trouble is a returned result,
 * never a throw, and never anything the user sees.
 *
 * – `https://` is verified before the call.
 * – A 10 s `AbortSignal.timeout` is applied; the payload is a few hundred bytes.
 * – `2xx` → caller should reset counters.
 * – Anything else → caller leaves counters untouched and waits for the next poll.
 */
import type { UsageReport } from './report'
import { USAGE_TIMEOUT_MS, isSafeUsageUrl, USAGE_URL } from './endpoint'

export type UsageResult =
  | { readonly ok: true }
  | { readonly ok: false }

export async function postUsage(
  report: UsageReport,
  url: string = USAGE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<UsageResult> {
  if (!isSafeUsageUrl(url)) {
    console.warn('Usage reporting is not configured for this build.')
    return { ok: false }
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
    })

    if (response.ok) return { ok: true }

    console.warn(`Usage report answered ${response.status} — will retry on next poll.`)
    return { ok: false }
  } catch (err) {
    console.warn(`Usage report failed to send — will retry on next poll. ${String(err)}`)
    return { ok: false }
  }
}
