/**
 * Pure functions for deciding when to report and what to send.
 *
 * Nothing here touches disk or the network — every branch is assertable
 * against a fixed clock, the same way `trial.ts` is tested.
 */
import type { UsageFile } from './usage-file'
import type { LicenseStatus } from '@shared/license/status'
import { collectSystemInfo } from '../feedback/diagnostics'

export type UsageReport = {
  readonly schema: 1
  readonly deviceId: string
  readonly idSource: 'hardware' | 'random'
  /** Local calendar day the report is filed under, YYYY-MM-DD. */
  readonly day: string
  /** When the counters started accumulating; null on the first ever report. */
  readonly since: string | null
  readonly captures: number
  readonly imagesSaved: number
  readonly imagesCopied: number
  readonly license: {
    readonly kind: 'licensed' | 'expired' | 'invalid' | 'trial' | 'trial-expired'
    /** The stored CHOP1 key, or null when none is stored. Verified server-side. */
    readonly token: string | null
    /** Only on an active trial, else null. */
    readonly trialDaysLeft: number | null
  }
  readonly appVersion: string
  readonly osVersion: string
  readonly arch: string
}

/**
 * The local calendar day for a given epoch ms and IANA time zone string.
 * Returns a `YYYY-MM-DD` string in the machine's zone.
 */
export function localDay(nowMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(nowMs))
}

/**
 * True when a report is due: the local calendar day differs from the last
 * reported day, or nothing has ever been sent.
 */
export function isReportDue(
  lastReportedDay: string | null,
  nowMs: number,
  timeZone: string,
): boolean {
  return localDay(nowMs, timeZone) !== lastReportedDay
}

/**
 * Assembles the wire payload from the in-memory usage state and the current
 * licence status.  The `token` for a licensed device is the raw stored key;
 * the server verifies it and extracts the email — the key never stays in the
 * server's database.
 *
 * `licenseToken` is the raw key string from `license.json` (may be null).
 */
export function buildReport(
  file: UsageFile,
  status: LicenseStatus,
  licenseToken: string | null,
  day: string,
): UsageReport {
  const kind = status.kind
  const trialDaysLeft = kind === 'trial' ? status.daysLeft : null

  // Only send the token when there is a stored key — for trial/trial-expired
  // there is nothing to send.
  const token = kind === 'licensed' || kind === 'expired' || kind === 'invalid'
    ? licenseToken
    : null

  const { appVersion, osVersion, arch } = collectSystemInfo()

  return {
    schema: 1,
    deviceId: file.deviceId,
    idSource: file.idSource,
    day,
    since: file.pendingSince,
    captures: file.captures,
    imagesSaved: file.imagesSaved,
    imagesCopied: file.imagesCopied,
    license: { kind, token, trialDaysLeft },
    appVersion,
    osVersion,
    arch,
  }
}
