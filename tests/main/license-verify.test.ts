import { describe, expect, it, vi } from 'vitest'
import {
  LICENSE_PUBLIC_KEY,
  licensePublicKey,
  toPublicKeyPem,
} from '../../src/main/license/public-key'
import { verifyLicenseKey } from '../../src/main/license/verify'
import { createIssuer, issueKey, SAMPLE_CLAIMS, toBase64Url } from '../helpers/license-keys'

const issuer = createIssuer()
const key = issueKey(issuer)

describe('verifyLicenseKey', () => {
  it('accepts a key this issuer signed', () => {
    expect(verifyLicenseKey(key, issuer.publicKey)).toEqual(SAMPLE_CLAIMS)
  })

  it('accepts a key that arrived wrapped across lines', () => {
    const wrapped = `${key.slice(0, 40)}\n${key.slice(40)}`
    expect(verifyLicenseKey(wrapped, issuer.publicKey)).toEqual(SAMPLE_CLAIMS)
  })

  it('rejects a key signed by somebody else', () => {
    expect(verifyLicenseKey(issueKey(createIssuer()), issuer.publicKey)).toBeNull()
  })

  it('rejects a key whose claims were edited after signing', () => {
    // The whole point: change the expiry, and the signature stops matching.
    const [, , signature] = key.split('.')
    const tampered = toBase64Url(
      Buffer.from(JSON.stringify({ ...SAMPLE_CLAIMS, edition: 'business' }), 'utf8'),
    )
    expect(verifyLicenseKey(`CHOP1.${tampered}.${signature}`, issuer.publicKey)).toBeNull()
  })

  it('rejects a signature lifted from another key', () => {
    const other = issueKey(issuer, { ...SAMPLE_CLAIMS, id: 'ORDER-9999' })
    const [, signed] = key.split('.')
    const [, , otherSignature] = other.split('.')
    expect(verifyLicenseKey(`CHOP1.${signed}.${otherSignature}`, issuer.publicKey)).toBeNull()
  })

  it('rejects a key whose claims this build cannot use', () => {
    const signedNonsense = issueKey(issuer, { id: 'ORDER-1', email: 'buyer@example.com' })
    expect(verifyLicenseKey(signedNonsense, issuer.publicKey)).toBeNull()
  })

  it('rejects everything when no public key is configured', () => {
    // A build that forgot its key must fail closed, not open.
    expect(verifyLicenseKey(key, '')).toBeNull()
  })

  it('rejects everything when the configured key is not usable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(verifyLicenseKey(key, 'not-a-key')).toBeNull()
    expect(console.warn).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('rejects malformed keys without throwing', () => {
    for (const bad of ['', 'nonsense', 'CHOP1.abc', 'CHOP2.a.b']) {
      expect(verifyLicenseKey(bad, issuer.publicKey)).toBeNull()
    }
  })
})

describe('toPublicKeyPem', () => {
  it('wraps base64 into a PEM envelope node can read', () => {
    const pem = toPublicKeyPem(issuer.publicKey)
    expect(pem.startsWith('-----BEGIN PUBLIC KEY-----\n')).toBe(true)
    expect(pem.trimEnd().endsWith('-----END PUBLIC KEY-----')).toBe(true)
  })

  it('tolerates whitespace in the stored constant', () => {
    expect(toPublicKeyPem(` ${issuer.publicKey} `)).toBe(toPublicKeyPem(issuer.publicKey))
  })
})

describe('licensePublicKey', () => {
  it('ignores the environment override in a packaged build', () => {
    // Otherwise anyone could point a shipped app at a pair they control.
    vi.stubEnv('CHOP_LICENSE_PUBLIC_KEY', issuer.publicKey)
    expect(licensePublicKey(true)).toBe(LICENSE_PUBLIC_KEY.trim())
    expect(licensePublicKey(true)).not.toBe(issuer.publicKey)
    vi.unstubAllEnvs()
  })

  it('honours the override in a development build, for testing against a throwaway pair', () => {
    vi.stubEnv('CHOP_LICENSE_PUBLIC_KEY', issuer.publicKey)
    expect(licensePublicKey(false)).toBe(issuer.publicKey)
    vi.unstubAllEnvs()
  })
})
