/**
 * Signature checking. Lives in the main process because it needs `node:crypto`
 * and because a renderer must never be the thing that decides entitlement.
 */
import { createPublicKey, verify } from 'node:crypto'
import { type LicenseClaims, parseClaims } from '@shared/license/claims'
import { decodeLicenseToken, signedBytes } from '@shared/license/token'
import { toPublicKeyPem } from './public-key'

function publicKeyObject(base64: string) {
  try {
    return createPublicKey({ key: toPublicKeyPem(base64), format: 'pem' })
  } catch {
    // A malformed constant is a build mistake, not something a user can fix.
    console.warn('The licence public key is not a usable Ed25519 key.')
    return null
  }
}

/**
 * Returns the claims of a genuine key, or null. Null covers every failure the
 * same way on purpose: a forged key and a mistyped one are both simply not a
 * licence, and saying which is which only helps whoever is guessing.
 *
 * With no public key configured nothing verifies, so a build that forgot to set
 * one fails closed rather than accepting everything.
 */
export function verifyLicenseKey(raw: string, publicKeyBase64: string): LicenseClaims | null {
  if (!publicKeyBase64) return null

  const token = decodeLicenseToken(raw)
  if (!token) return null

  const key = publicKeyObject(publicKeyBase64)
  if (!key) return null

  try {
    // Ed25519 hashes internally, so the algorithm argument is null.
    if (!verify(null, signedBytes(token.signed), key, token.signature)) return null
  } catch {
    return null
  }

  return parseClaims(token.payload)
}
