import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto'
import type { LicenseClaims } from '../../src/shared/license/claims'

export type IssuerPair = {
  /** Base64 SPKI DER, the form `LICENSE_PUBLIC_KEY` holds. */
  readonly publicKey: string
  readonly privateKey: KeyObject
}

/**
 * A throwaway issuer, so tests never depend on the key the product ships with
 * and a forged key can be built from a second pair.
 */
export function createIssuer(): IssuerPair {
  const pair = generateKeyPairSync('ed25519')
  return {
    publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: pair.privateKey,
  }
}

export function toBase64Url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const SAMPLE_CLAIMS: LicenseClaims = {
  id: 'ORDER-1043',
  email: 'buyer@example.com',
  name: 'Ada Lovelace',
  edition: 'personal',
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
}

/** Mints a key the same way `scripts/sign-license.mjs` does. */
export function issueKey(issuer: IssuerPair, claims: unknown = SAMPLE_CLAIMS): string {
  const signed = toBase64Url(Buffer.from(JSON.stringify(claims), 'utf8'))
  const signature = toBase64Url(sign(null, Buffer.from(signed, 'utf8'), issuer.privateKey))
  return `CHOP1.${signed}.${signature}`
}
