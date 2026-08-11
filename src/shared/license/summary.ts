/**
 * The words Chop puts in front of the user about their licence, in one place so
 * the tray, the Settings pane and the blocking dialog cannot drift apart.
 */
import type { LicenseStatus } from './status'
import { TRIAL_DAYS } from './trial'

export type SummaryTone = 'good' | 'warning' | 'error'

export type LicenseSummary = {
  readonly tone: SummaryTone
  /** One line of state, e.g. "Trial — 6 days left". */
  readonly headline: string
  /** A sentence of context beneath it. */
  readonly detail: string
}

/**
 * Dates are rendered in UTC so the same instant reads the same everywhere, and
 * so tests do not depend on the machine's time zone.
 */
export function formatLicenseDate(iso: string): string {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return 'an unknown date'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed)
}

function licensedDetail(expiresAt: string | null, email: string): string {
  if (expiresAt === null) return `Licensed to ${email}. This licence does not expire.`
  return `Licensed to ${email} until ${formatLicenseDate(expiresAt)}.`
}

export function licenseSummary(status: LicenseStatus): LicenseSummary {
  switch (status.kind) {
    case 'licensed':
      return {
        tone: 'good',
        headline: 'Licensed',
        detail: licensedDetail(status.claims.expiresAt, status.claims.email),
      }

    case 'expired':
      return {
        tone: 'error',
        headline: 'Licence expired',
        detail: `The licence for ${status.claims.email} ran out on ${formatLicenseDate(
          status.claims.expiresAt ?? '',
        )}. Renew it to keep capturing.`,
      }

    case 'invalid':
      return {
        tone: 'error',
        headline: 'Licence not recognised',
        detail:
          'The stored key did not pass verification. Paste it again straight from your receipt — it may have been cut short.',
      }

    case 'trial': {
      const days = status.daysLeft === 1 ? '1 day' : `${status.daysLeft} days`
      return {
        tone: status.daysLeft <= 3 ? 'warning' : 'good',
        headline: `Trial — ${days} left`,
        detail: `Your trial runs until ${formatLicenseDate(status.endsAt)}. Everything is unlocked until then.`,
      }
    }

    case 'trial-expired':
      return {
        tone: 'error',
        headline: 'Trial ended',
        detail: `Your ${TRIAL_DAYS}-day trial ended on ${formatLicenseDate(
          status.endsAt,
        )}. Enter a licence key to keep capturing.`,
      }
  }
}

/** The short form shown as a disabled line in the tray menu. */
export function trayLicenseLabel(status: LicenseStatus): string {
  switch (status.kind) {
    case 'licensed':
      return 'Licensed'
    case 'expired':
      return 'Licence expired'
    case 'invalid':
      return 'Licence not recognised'
    case 'trial':
      return `Trial — ${status.daysLeft === 1 ? '1 day' : `${status.daysLeft} days`} left`
    case 'trial-expired':
      return 'Trial ended'
  }
}
