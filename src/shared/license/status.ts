/**
 * The one place that decides what a user is entitled to. Everything it needs
 * arrives as arguments — no clock, no disk — so every branch is testable.
 */
import { hasExpired, type LicenseClaims } from './claims'
import { isTrialActive, trialDaysLeft, trialEndsAt } from './trial'

export type LicenseStatus =
  /** A good key is installed. */
  | { readonly kind: 'licensed'; readonly claims: LicenseClaims }
  /** The key is genuine but its term has run out. */
  | { readonly kind: 'expired'; readonly claims: LicenseClaims }
  /** A key is stored but does not verify: mistyped, truncated, or forged. */
  | { readonly kind: 'invalid' }
  /** No key yet, still inside the trial. */
  | { readonly kind: 'trial'; readonly daysLeft: number; readonly endsAt: string }
  /** No key, trial over. */
  | { readonly kind: 'trial-expired'; readonly endsAt: string }

export type LicenseFacts = {
  /** Claims from a key whose signature has already been checked, else null. */
  readonly claims: LicenseClaims | null
  /** Whether any key at all is stored, so a bad one can be told from none. */
  readonly keyStored: boolean
  /** Epoch ms the trial began, or null before the first launch is recorded. */
  readonly trialStartedAt: number | null
  readonly now: number
}

export function licenseStatus(facts: LicenseFacts): LicenseStatus {
  const { claims, keyStored, trialStartedAt, now } = facts

  if (claims) {
    return hasExpired(claims, now) ? { kind: 'expired', claims } : { kind: 'licensed', claims }
  }
  if (keyStored) return { kind: 'invalid' }

  // A trial that has not been stamped yet is starting right now, which is what
  // the first launch sees before the stamp is written.
  const endsAtMs = trialEndsAt(trialStartedAt ?? now, now)
  const endsAt = new Date(endsAtMs).toISOString()

  if (!isTrialActive(endsAtMs, now)) return { kind: 'trial-expired', endsAt }
  return { kind: 'trial', daysLeft: trialDaysLeft(endsAtMs, now), endsAt }
}

/** Whether capture is allowed. The only entitlement Chop gates on today. */
export function canCapture(status: LicenseStatus): boolean {
  return status.kind === 'licensed' || status.kind === 'trial'
}

/** True when the user should be nudged to buy: everything except a good key. */
export function needsLicense(status: LicenseStatus): boolean {
  return status.kind !== 'licensed'
}
