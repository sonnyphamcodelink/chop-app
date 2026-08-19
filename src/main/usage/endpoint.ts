/**
 * Where usage data goes.
 *
 * The endpoint is unauthenticated by design — rate-limit it on the server.
 * A `CHOP_USAGE_URL` env override lets a development build point at a local
 * Worker without touching the packaged constant.
 */
export const USAGE_URL = process.env.CHOP_USAGE_URL ?? 'https://api.chop.asia/usage'

/** Short enough to give up quickly — the payload is a few hundred bytes. */
export const USAGE_TIMEOUT_MS = 10_000

/** Only https posts are ever made. */
export function isSafeUsageUrl(url: string): boolean {
  return url.startsWith('https://')
}
