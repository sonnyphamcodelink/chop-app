import { describe, expect, it } from 'vitest'
import { hasExpired, type LicenseClaims, parseClaims } from '../../../src/shared/license/claims'
import { SAMPLE_CLAIMS } from '../../helpers/license-keys'

const AT_ISSUE = Date.parse(SAMPLE_CLAIMS.issuedAt)

describe('parseClaims', () => {
  it('reads a complete set of claims', () => {
    expect(parseClaims({ ...SAMPLE_CLAIMS })).toEqual(SAMPLE_CLAIMS)
  })

  it('treats an absent name as no name rather than a failure', () => {
    const { name: _name, ...rest } = SAMPLE_CLAIMS
    expect(parseClaims(rest)?.name).toBeNull()
  })

  it('treats an absent expiry as perpetual', () => {
    const { expiresAt: _expiresAt, ...rest } = SAMPLE_CLAIMS
    expect(parseClaims(rest)?.expiresAt).toBeNull()
  })

  it('keeps an expiry it can turn into an instant', () => {
    const claims = parseClaims({ ...SAMPLE_CLAIMS, expiresAt: '2027-01-01T00:00:00.000Z' })
    expect(claims?.expiresAt).toBe('2027-01-01T00:00:00.000Z')
  })

  it('trims the strings it keeps', () => {
    const claims = parseClaims({ ...SAMPLE_CLAIMS, email: '  buyer@example.com  ' })
    expect(claims?.email).toBe('buyer@example.com')
  })

  it('rejects anything that is not an object', () => {
    expect(parseClaims(null)).toBeNull()
    expect(parseClaims('CHOP1')).toBeNull()
    expect(parseClaims(42)).toBeNull()
    expect(parseClaims(undefined)).toBeNull()
  })

  it('rejects claims missing a field the app relies on', () => {
    for (const field of ['id', 'email', 'edition', 'issuedAt'] as const) {
      expect(parseClaims({ ...SAMPLE_CLAIMS, [field]: undefined })).toBeNull()
      expect(parseClaims({ ...SAMPLE_CLAIMS, [field]: '' })).toBeNull()
    }
  })

  it('rejects an edition this build does not sell', () => {
    expect(parseClaims({ ...SAMPLE_CLAIMS, edition: 'enterprise' })).toBeNull()
  })

  it('rejects dates that are not instants', () => {
    expect(parseClaims({ ...SAMPLE_CLAIMS, issuedAt: 'whenever' })).toBeNull()
    expect(parseClaims({ ...SAMPLE_CLAIMS, expiresAt: 'whenever' })).toBeNull()
    expect(parseClaims({ ...SAMPLE_CLAIMS, expiresAt: 42 })).toBeNull()
  })
})

describe('hasExpired', () => {
  const dated: LicenseClaims = { ...SAMPLE_CLAIMS, expiresAt: '2026-06-01T00:00:00.000Z' }
  const expiry = Date.parse(dated.expiresAt!)

  it('never expires a perpetual licence', () => {
    expect(hasExpired(SAMPLE_CLAIMS, Number.MAX_SAFE_INTEGER)).toBe(false)
  })

  it('holds until the moment of expiry', () => {
    expect(hasExpired(dated, AT_ISSUE)).toBe(false)
    expect(hasExpired(dated, expiry - 1)).toBe(false)
  })

  it('expires on the instant itself, not a moment later', () => {
    expect(hasExpired(dated, expiry)).toBe(true)
    expect(hasExpired(dated, expiry + 1)).toBe(true)
  })
})
