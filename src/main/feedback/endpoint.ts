/**
 * Where feedback goes. Change these to your own inbox.
 *
 * `FEEDBACK_URL` takes a `multipart/form-data` POST with `kind`, `message`,
 * `diagnostics` (JSON, absent when the user opted out) and an optional
 * `capture` file. Anything that can receive a form post works — a Cloudflare
 * Worker forwarding to email, or straight into an issue tracker. The endpoint
 * is unauthenticated by design, so rate-limit it on the server: nothing in the
 * app can stop someone posting to it directly.
 *
 * `FEEDBACK_EMAIL` is the way out when the endpoint cannot be reached. Chop is
 * offline-first, so that will happen, and losing what someone just typed is
 * the one outcome this feature cannot afford.
 */
export const FEEDBACK_URL = 'https://chop.asia/api/feedback'

export const FEEDBACK_EMAIL = 'feedback@chop.asia'

/** Long enough for a capture on a slow connection, short enough to give up. */
export const FEEDBACK_TIMEOUT_MS = 20_000

/** Only https posts are ever made, the same rule the purchase link follows. */
export function isSafeFeedbackUrl(url: string): boolean {
  return url.startsWith('https://')
}
