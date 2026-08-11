import { describe, expect, it } from 'vitest'
import type { LicenseStatus } from '../../../src/shared/license/status'
import {
  formatLicenseDate,
  licenseSummary,
  trayLicenseLabel,
} from '../../../src/shared/license/summary'
import { TRIAL_DAYS } from '../../../src/shared/license/trial'
import { SAMPLE_CLAIMS } from '../../helpers/license-keys'

const ENDS_AT = '2026-08-20T00:00:00.000Z'

function trial(daysLeft: number): LicenseStatus {
  return { kind: 'trial', daysLeft, endsAt: ENDS_AT }
}

describe('formatLicenseDate', () => {
  it('renders in UTC, so the same instant reads the same everywhere', () => {
    expect(formatLicenseDate('2026-08-20T00:00:00.000Z')).toBe('Aug 20, 2026')
  })

  it('says so rather than printing "Invalid Date"', () => {
    expect(formatLicenseDate('whenever')).toBe('an unknown date')
  })
})

describe('licenseSummary', () => {
  it('names the licensee and says a perpetual licence never runs out', () => {
    const summary = licenseSummary({ kind: 'licensed', claims: SAMPLE_CLAIMS })
    expect(summary.tone).toBe('good')
    expect(summary.headline).toBe('Licensed')
    expect(summary.detail).toContain(SAMPLE_CLAIMS.email)
    expect(summary.detail).toContain('does not expire')
  })

  it('gives the end date of a dated licence', () => {
    const claims = { ...SAMPLE_CLAIMS, expiresAt: ENDS_AT }
    expect(licenseSummary({ kind: 'licensed', claims }).detail).toContain('Aug 20, 2026')
  })

  it('turns urgent in the last three days of the trial', () => {
    expect(licenseSummary(trial(TRIAL_DAYS)).tone).toBe('good')
    expect(licenseSummary(trial(4)).tone).toBe('good')
    expect(licenseSummary(trial(3)).tone).toBe('warning')
    expect(licenseSummary(trial(1)).tone).toBe('warning')
  })

  it('counts a single day in the singular', () => {
    expect(licenseSummary(trial(1)).headline).toBe('Trial — 1 day left')
    expect(licenseSummary(trial(2)).headline).toBe('Trial — 2 days left')
  })

  it('tells an expired licence apart from an ended trial', () => {
    const expired = licenseSummary({
      kind: 'expired',
      claims: { ...SAMPLE_CLAIMS, expiresAt: ENDS_AT },
    })
    expect(expired.tone).toBe('error')
    expect(expired.detail).toContain('Renew')

    const lapsed = licenseSummary({ kind: 'trial-expired', endsAt: ENDS_AT })
    expect(lapsed.tone).toBe('error')
    expect(lapsed.detail).toContain(`${TRIAL_DAYS}-day trial`)
  })

  it('tells someone with a bad key to paste it again', () => {
    const summary = licenseSummary({ kind: 'invalid' })
    expect(summary.tone).toBe('error')
    expect(summary.detail).toContain('again')
  })
})

describe('trayLicenseLabel', () => {
  it('stays short enough for a menu line', () => {
    const statuses: LicenseStatus[] = [
      { kind: 'licensed', claims: SAMPLE_CLAIMS },
      { kind: 'expired', claims: SAMPLE_CLAIMS },
      { kind: 'invalid' },
      trial(6),
      { kind: 'trial-expired', endsAt: ENDS_AT },
    ]
    for (const status of statuses) {
      expect(trayLicenseLabel(status).length).toBeLessThanOrEqual(30)
    }
  })

  it('counts a single day in the singular', () => {
    expect(trayLicenseLabel(trial(1))).toBe('Trial — 1 day left')
    expect(trayLicenseLabel(trial(6))).toBe('Trial — 6 days left')
  })
})
