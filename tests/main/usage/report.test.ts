import { describe, expect, it, vi, beforeEach } from 'vitest'

// report.ts calls collectSystemInfo() which calls app.getVersion() — mock electron
// before the dynamic import so the mock is in effect when the module loads.
vi.mock('electron', () => ({
  app: { getVersion: () => '1.2.3' },
}))

// collectSystemInfo also calls release() from node:os
vi.mock('node:os', () => ({
  release: () => '24.0.0',
}))

// diagnostics.ts is imported by report.ts; mock its collectSystemInfo so we
// control what the report gets without touching the real electron.
vi.mock('../../../src/main/feedback/diagnostics', () => ({
  collectSystemInfo: () => ({
    appVersion: '1.2.3',
    osVersion: '24.0.0',
    arch: 'arm64',
  }),
}))

const { isReportDue, localDay, buildReport } = await import('../../../src/main/usage/report')

import type { UsageFile } from '../../../src/main/usage/usage-file'
import type { LicenseStatus } from '../../../src/shared/license/status'

// ---------------------------------------------------------------------------
// localDay
// ---------------------------------------------------------------------------

describe('localDay', () => {
  const UTC_MS = Date.UTC(2026, 7, 19, 23, 30, 0) // 2026-08-19T23:30:00Z

  it('returns YYYY-MM-DD in the given time zone', () => {
    expect(localDay(UTC_MS, 'UTC')).toBe('2026-08-19')
  })

  it('is one day ahead in a +01:00 zone when UTC is 23:30', () => {
    // 23:30 UTC → 00:30 next day in Europe/London (summer, UTC+1)
    expect(localDay(UTC_MS, 'Europe/London')).toBe('2026-08-20')
  })

  it('is the same day in a west coast US zone', () => {
    // 23:30 UTC → 16:30 in America/Los_Angeles (PDT, UTC-7)
    expect(localDay(UTC_MS, 'America/Los_Angeles')).toBe('2026-08-19')
  })

  it('handles year and month boundaries', () => {
    // 2026-12-31T23:30:00Z → still 2026-12-31 in UTC
    const yearEnd = Date.UTC(2026, 11, 31, 23, 30, 0)
    expect(localDay(yearEnd, 'UTC')).toBe('2026-12-31')
    // But 2027-01-01 in UTC+1
    expect(localDay(yearEnd, 'Europe/Paris')).toBe('2027-01-01')
  })
})

// ---------------------------------------------------------------------------
// isReportDue
// ---------------------------------------------------------------------------

describe('isReportDue', () => {
  const UTC_MS = Date.UTC(2026, 7, 19, 12, 0, 0) // 2026-08-19T12:00:00Z

  it('is due when lastReportedDay is null (first ever report)', () => {
    expect(isReportDue(null, UTC_MS, 'UTC')).toBe(true)
  })

  it('is not due when last reported day equals the current local day', () => {
    expect(isReportDue('2026-08-19', UTC_MS, 'UTC')).toBe(false)
  })

  it('is due when the current day has advanced', () => {
    expect(isReportDue('2026-08-18', UTC_MS, 'UTC')).toBe(true)
  })

  it('is due after a month boundary', () => {
    const sep1 = Date.UTC(2026, 8, 1, 12, 0, 0)
    expect(isReportDue('2026-08-31', sep1, 'UTC')).toBe(true)
  })

  it('is due after a year boundary', () => {
    const jan1 = Date.UTC(2027, 0, 1, 12, 0, 0)
    expect(isReportDue('2026-12-31', jan1, 'UTC')).toBe(true)
  })

  it('is not due when the clock has gone backwards within the same day', () => {
    // The stored day matches — don't re-report just because time went backwards.
    expect(isReportDue('2026-08-19', UTC_MS - 3600_000, 'UTC')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildReport
// ---------------------------------------------------------------------------

const BASE_FILE: UsageFile = {
  deviceId: 'abc123',
  idSource: 'hardware',
  captures: 5,
  imagesSaved: 3,
  imagesCopied: 2,
  pendingSince: '2026-08-18T00:00:00.000Z',
  lastReportedDay: '2026-08-18',
}

const TODAY = '2026-08-19'
const SAMPLE_TOKEN = 'CHOP1.abc.def'

describe('buildReport', () => {
  it('includes the correct schema version', () => {
    const status: LicenseStatus = { kind: 'trial', daysLeft: 10, endsAt: '' }
    expect(buildReport(BASE_FILE, status, null, TODAY).schema).toBe(1)
  })

  it('copies device fields from the usage file', () => {
    const status: LicenseStatus = { kind: 'trial', daysLeft: 10, endsAt: '' }
    const report = buildReport(BASE_FILE, status, null, TODAY)
    expect(report.deviceId).toBe('abc123')
    expect(report.idSource).toBe('hardware')
  })

  it('copies counters from the usage file', () => {
    const status: LicenseStatus = { kind: 'trial', daysLeft: 10, endsAt: '' }
    const report = buildReport(BASE_FILE, status, null, TODAY)
    expect(report.captures).toBe(5)
    expect(report.imagesSaved).toBe(3)
    expect(report.imagesCopied).toBe(2)
  })

  it('sets since from pendingSince', () => {
    const status: LicenseStatus = { kind: 'trial', daysLeft: 10, endsAt: '' }
    const report = buildReport(BASE_FILE, status, null, TODAY)
    expect(report.since).toBe('2026-08-18T00:00:00.000Z')
  })

  it('includes app/os/arch from collectSystemInfo', () => {
    const status: LicenseStatus = { kind: 'trial', daysLeft: 10, endsAt: '' }
    const report = buildReport(BASE_FILE, status, null, TODAY)
    expect(report.appVersion).toBe('1.2.3')
    expect(report.osVersion).toBe('24.0.0')
    expect(report.arch).toBe('arm64')
  })

  describe('license field — kind: licensed', () => {
    const status: LicenseStatus = {
      kind: 'licensed',
      claims: { id: 'ord1', email: 'a@b.com', name: null, edition: 'personal', issuedAt: '', expiresAt: null },
    }

    it('sets kind to licensed', () => {
      expect(buildReport(BASE_FILE, status, SAMPLE_TOKEN, TODAY).license.kind).toBe('licensed')
    })

    it('includes the token so the server can extract the email', () => {
      expect(buildReport(BASE_FILE, status, SAMPLE_TOKEN, TODAY).license.token).toBe(SAMPLE_TOKEN)
    })

    it('sets trialDaysLeft to null', () => {
      expect(buildReport(BASE_FILE, status, SAMPLE_TOKEN, TODAY).license.trialDaysLeft).toBeNull()
    })
  })

  describe('license field — kind: expired', () => {
    const status: LicenseStatus = {
      kind: 'expired',
      claims: { id: 'ord1', email: 'a@b.com', name: null, edition: 'personal', issuedAt: '', expiresAt: '2020-01-01T00:00:00Z' },
    }

    it('sets kind to expired and includes the token', () => {
      const report = buildReport(BASE_FILE, status, SAMPLE_TOKEN, TODAY)
      expect(report.license.kind).toBe('expired')
      expect(report.license.token).toBe(SAMPLE_TOKEN)
    })
  })

  describe('license field — kind: invalid', () => {
    const status: LicenseStatus = { kind: 'invalid' }

    it('sets kind to invalid and includes the stored (bad) token', () => {
      const report = buildReport(BASE_FILE, status, SAMPLE_TOKEN, TODAY)
      expect(report.license.kind).toBe('invalid')
      expect(report.license.token).toBe(SAMPLE_TOKEN)
    })

    it('sets token to null when no key is stored', () => {
      const report = buildReport(BASE_FILE, status, null, TODAY)
      expect(report.license.token).toBeNull()
    })
  })

  describe('license field — kind: trial', () => {
    const status: LicenseStatus = { kind: 'trial', daysLeft: 7, endsAt: '' }

    it('sets kind to trial', () => {
      expect(buildReport(BASE_FILE, status, null, TODAY).license.kind).toBe('trial')
    })

    it('sets trialDaysLeft from the status', () => {
      expect(buildReport(BASE_FILE, status, null, TODAY).license.trialDaysLeft).toBe(7)
    })

    it('sends no token for a trial', () => {
      expect(buildReport(BASE_FILE, status, null, TODAY).license.token).toBeNull()
    })
  })

  describe('license field — kind: trial-expired', () => {
    const status: LicenseStatus = { kind: 'trial-expired', endsAt: '' }

    it('sets kind to trial-expired with no token and no trial days', () => {
      const report = buildReport(BASE_FILE, status, null, TODAY)
      expect(report.license.kind).toBe('trial-expired')
      expect(report.license.token).toBeNull()
      expect(report.license.trialDaysLeft).toBeNull()
    })
  })
})
