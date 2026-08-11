import { describe, expect, it } from 'vitest'
import {
  decodeLicenseToken,
  LICENSE_KEY_PREFIX,
  maskLicenseKey,
  normalizeLicenseKey,
  signedBytes,
  SIGNATURE_BYTES,
} from '../../../src/shared/license/token'
import { createIssuer, issueKey, SAMPLE_CLAIMS, toBase64Url } from '../../helpers/license-keys'

const issuer = createIssuer()
const key = issueKey(issuer)

describe('normalizeLicenseKey', () => {
  it('strips the whitespace an email may have wrapped in', () => {
    expect(normalizeLicenseKey(` ${key.slice(0, 20)}\n  ${key.slice(20)}\t`)).toBe(key)
  })

  it('leaves case alone, because base64url is case-sensitive', () => {
    expect(normalizeLicenseKey('CHOP1.aB.cD')).toBe('CHOP1.aB.cD')
  })
})

describe('decodeLicenseToken', () => {
  it('reads the claims and signature out of a well-formed key', () => {
    const token = decodeLicenseToken(key)
    expect(token?.payload).toEqual(SAMPLE_CLAIMS)
    expect(token?.signature).toHaveLength(SIGNATURE_BYTES)
  })

  it('reads a key that arrived wrapped across lines', () => {
    expect(decodeLicenseToken(`${key.slice(0, 30)}\n${key.slice(30)}`)?.payload).toEqual(
      SAMPLE_CLAIMS,
    )
  })

  it('hands back the exact segment the signature covers', () => {
    const token = decodeLicenseToken(key)
    expect(token?.signed).toBe(key.split('.')[1])
  })

  it('rejects a key with the wrong number of segments', () => {
    expect(decodeLicenseToken('')).toBeNull()
    expect(decodeLicenseToken('CHOP1.abc')).toBeNull()
    expect(decodeLicenseToken(`${key}.extra`)).toBeNull()
  })

  it('rejects a key from a format this build does not know', () => {
    expect(decodeLicenseToken(key.replace('CHOP1', 'CHOP2'))).toBeNull()
  })

  it('rejects segments that are not base64url', () => {
    const [, signed, signature] = key.split('.')
    expect(decodeLicenseToken(`CHOP1.not base64!.${signature}`)).toBeNull()
    expect(decodeLicenseToken(`CHOP1.${signed}.not+base64url/`)).toBeNull()
  })

  it('rejects a signature that is not Ed25519-sized', () => {
    const [, signed] = key.split('.')
    const short = toBase64Url(Buffer.alloc(SIGNATURE_BYTES - 1))
    expect(decodeLicenseToken(`CHOP1.${signed}.${short}`)).toBeNull()
  })

  it('rejects claims that are not JSON', () => {
    const [, , signature] = key.split('.')
    const garbage = toBase64Url(Buffer.from('{ broken', 'utf8'))
    expect(decodeLicenseToken(`CHOP1.${garbage}.${signature}`)).toBeNull()
  })

  it('does not vouch for the signature, only the shape', () => {
    // A key signed by somebody else still decodes; verification is a later step.
    const forged = issueKey(createIssuer())
    expect(decodeLicenseToken(forged)).not.toBeNull()
  })
})

describe('signedBytes', () => {
  it('encodes the segment as ASCII, matching what the signer covered', () => {
    expect(Buffer.from(signedBytes('abc')).toString('utf8')).toBe('abc')
  })
})

describe('maskLicenseKey', () => {
  it('shows a short fragment and no more', () => {
    const masked = maskLicenseKey(key)
    expect(masked.startsWith(`${LICENSE_KEY_PREFIX}…`)).toBe(true)
    expect(masked.length).toBeLessThan(20)
    expect(key).toContain(masked.split('…')[1])
  })

  it('tells two keys apart', () => {
    // A leading fragment could not: every key starts with the same `{"id":…`.
    const other = issueKey(issuer, { ...SAMPLE_CLAIMS, id: 'ORDER-9999' })
    expect(maskLicenseKey(key)).not.toBe(maskLicenseKey(other))
  })

  it('tells apart two keys issued to the same buyer', () => {
    expect(maskLicenseKey(key)).not.toBe(maskLicenseKey(issueKey(createIssuer())))
  })

  it('falls back to a dash for anything unrecognisable', () => {
    expect(maskLicenseKey('nonsense')).toBe('—')
    expect(maskLicenseKey('')).toBe('—')
    expect(maskLicenseKey('CHOP1.abc')).toBe('—')
  })
})
