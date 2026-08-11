/**
 * Trial arithmetic, kept pure so the boundaries can be asserted against fixed
 * clocks rather than waited out.
 */

/** Days of unrestricted use before a key is required. */
export const TRIAL_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

export const TRIAL_MS = TRIAL_DAYS * DAY_MS

/**
 * When the trial that began at `startedAt` runs out.
 *
 * A start in the future is clamped to `now`. That covers a clock that was wrong
 * on first launch far more often than it covers someone editing the file, and
 * the honest case should not be punished for the dishonest one.
 */
export function trialEndsAt(startedAt: number, now: number): number {
  return Math.min(startedAt, now) + TRIAL_MS
}

/**
 * Whole days left, rounded up so the last partial day still reads as "1 day
 * left" rather than "0". Never negative.
 */
export function trialDaysLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / DAY_MS))
}

export function isTrialActive(endsAt: number, now: number): boolean {
  return now < endsAt
}

const RELATIVE_DAYS = /^-(\d+)d?$/

/**
 * Reads a pretend trial start, for exercising the end of the trial without
 * waiting a month or hand-editing `license.json`.
 *
 * Accepts an ISO instant, or a negative day count like `-31` / `-31d` meaning
 * "started that many days ago". Returns null for anything else, so a typo falls
 * back to the real stamp rather than silently granting a fresh trial.
 */
export function parseTrialOverride(raw: string, now: number): number | null {
  const text = raw.trim()
  if (!text) return null

  const relative = RELATIVE_DAYS.exec(text)
  if (relative) return now - Number(relative[1]) * DAY_MS

  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}
