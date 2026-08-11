import { describe, expect, it } from 'vitest'
import type { LicenseClaims } from '../../../src/shared/license/claims'
import {
  canCapture,
  type LicenseFacts,
  licenseStatus,
  needsLicense,
} from '../../../src/shared/license/status'
import { TRIAL_DAYS, TRIAL_MS } from '../../../src/shared/license/trial'
import { SAMPLE_CLAIMS } from '../../helpers/license-keys'

const NOW = Date.parse('2026-08-11T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function facts(overrides: Partial<LicenseFacts> = {}): LicenseFacts {
  return { claims: null, keyStored: false, trialStartedAt: null, now: NOW, ...overrides }
}

describe('licenseStatus', () => {
  it('is licensed while a perpetual key is installed', () => {
    const status = licenseStatus(facts({ claims: SAMPLE_CLAIMS, keyStored: true }))
    expect(status).toEqual({ kind: 'licensed', claims: SAMPLE_CLAIMS })
  })

  it('is licensed while a dated key still has time on it', () => {
    const claims: LicenseClaims = {
      ...SAMPLE_CLAIMS,
      expiresAt: new Date(NOW + DAY_MS).toISOString(),
    }
    expect(licenseStatus(facts({ claims, keyStored: true })).kind).toBe('licensed')
  })

  it('is expired once a dated key runs out', () => {
    const claims: LicenseClaims = {
      ...SAMPLE_CLAIMS,
      expiresAt: new Date(NOW - DAY_MS).toISOString(),
    }
    expect(licenseStatus(facts({ claims, keyStored: true }))).toEqual({ kind: 'expired', claims })
  })

  it('prefers a good key over a trial that has not run out', () => {
    const status = licenseStatus(
      facts({ claims: SAMPLE_CLAIMS, keyStored: true, trialStartedAt: NOW }),
    )
    expect(status.kind).toBe('licensed')
  })

  it('reports a stored key that did not verify as invalid, not as no key', () => {
    expect(licenseStatus(facts({ keyStored: true }))).toEqual({ kind: 'invalid' })
  })

  it('does not fall back to the trial when a key is installed but bad', () => {
    // Otherwise a forged key would quietly buy someone another fortnight.
    expect(licenseStatus(facts({ keyStored: true, trialStartedAt: NOW })).kind).toBe('invalid')
  })

  it('starts the trial at full length before any stamp is written', () => {
    const status = licenseStatus(facts())
    expect(status).toMatchObject({ kind: 'trial', daysLeft: TRIAL_DAYS })
  })

  it('counts down from the stamp', () => {
    const status = licenseStatus(facts({ trialStartedAt: NOW - 10 * DAY_MS }))
    expect(status).toMatchObject({ kind: 'trial', daysLeft: TRIAL_DAYS - 10 })
  })

  it('reports the day the trial runs out', () => {
    const startedAt = NOW - 3 * DAY_MS
    const status = licenseStatus(facts({ trialStartedAt: startedAt }))
    expect(status.kind === 'trial' && status.endsAt).toBe(
      new Date(startedAt + TRIAL_MS).toISOString(),
    )
  })

  it('ends the trial the instant it lapses', () => {
    const startedAt = NOW - TRIAL_MS
    expect(licenseStatus(facts({ trialStartedAt: startedAt })).kind).toBe('trial-expired')
    expect(licenseStatus(facts({ trialStartedAt: startedAt + 1 })).kind).toBe('trial')
  })

  it('does not restart the trial for a stamp dated in the future', () => {
    const status = licenseStatus(facts({ trialStartedAt: NOW + 90 * DAY_MS }))
    expect(status).toMatchObject({ kind: 'trial', daysLeft: TRIAL_DAYS })
  })
})

describe('canCapture', () => {
  it('allows a licence and a live trial', () => {
    expect(canCapture({ kind: 'licensed', claims: SAMPLE_CLAIMS })).toBe(true)
    expect(canCapture({ kind: 'trial', daysLeft: 1, endsAt: '2026-08-12T00:00:00.000Z' })).toBe(true)
  })

  it('blocks everything else', () => {
    expect(canCapture({ kind: 'expired', claims: SAMPLE_CLAIMS })).toBe(false)
    expect(canCapture({ kind: 'invalid' })).toBe(false)
    expect(canCapture({ kind: 'trial-expired', endsAt: '2026-08-01T00:00:00.000Z' })).toBe(false)
  })
})

describe('needsLicense', () => {
  it('is quiet only when a good key is installed', () => {
    expect(needsLicense({ kind: 'licensed', claims: SAMPLE_CLAIMS })).toBe(false)
    expect(needsLicense({ kind: 'trial', daysLeft: 9, endsAt: '2026-08-20T00:00:00.000Z' })).toBe(
      true,
    )
    expect(needsLicense({ kind: 'invalid' })).toBe(true)
  })
})
