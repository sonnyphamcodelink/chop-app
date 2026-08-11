/**
 * The wire format of a licence key: `CHOP1.<claims>.<signature>`, where both
 * segments are base64url. Splitting and decoding live here, apart from the
 * signature check, so the format can be asserted without any crypto.
 *
 * Keys are long because they carry a signature. That is the price of verifying
 * offline, and users paste them rather than type them.
 */

/** Format marker, so a later key layout can be told apart from this one. */
export const LICENSE_KEY_PREFIX = 'CHOP1'

const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/

/** Ed25519 signatures are always exactly this long. */
export const SIGNATURE_BYTES = 64

export type LicenseToken = {
  /** The claims segment as it appeared, which is the string that was signed. */
  readonly signed: string
  /** Parsed but not yet validated claims payload. */
  readonly payload: unknown
  readonly signature: Uint8Array
}

/**
 * Strips whitespace so a key that wrapped across lines in an email still works.
 * base64url is case-sensitive, so case is left alone.
 */
export function normalizeLicenseKey(raw: string): string {
  return raw.replace(/\s+/g, '')
}

function decodeBase64Url(segment: string): Uint8Array | null {
  if (!SEGMENT_PATTERN.test(segment)) return null

  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    // atob rejects a length that cannot be a base64 body.
    return null
  }
}

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return undefined
  }
}

/**
 * Returns null for anything that is not a well-formed key. Nothing here proves
 * a key is genuine — only that it is shaped like one and can be decoded.
 */
export function decodeLicenseToken(raw: string): LicenseToken | null {
  const parts = normalizeLicenseKey(raw).split('.')
  if (parts.length !== 3) return null

  const [prefix, signed, signatureSegment] = parts
  if (prefix !== LICENSE_KEY_PREFIX || !signed || !signatureSegment) return null

  const claimBytes = decodeBase64Url(signed)
  const signature = decodeBase64Url(signatureSegment)
  if (!claimBytes || !signature || signature.length !== SIGNATURE_BYTES) return null

  const payload = decodeJson(claimBytes)
  if (payload === undefined) return null

  return { signed, payload, signature }
}

/** The exact bytes a signature covers: the claims segment, as ASCII. */
export function signedBytes(signed: string): Uint8Array {
  return new TextEncoder().encode(signed)
}

/** How much of the signature the masked form shows. */
const MASK_LENGTH = 8

/**
 * A fragment of a key that a support request can quote to identify it.
 *
 * It shows the tail of the *signature*, not the head of the claims: every key
 * begins with the same encoded `{"id":…`, so a leading fragment would look
 * identical for every customer. The tail is unique per key and useless on its
 * own, since verification needs the whole thing.
 */
export function maskLicenseKey(raw: string): string {
  const parts = normalizeLicenseKey(raw).split('.')
  const signature = parts[2]
  if (parts[0] !== LICENSE_KEY_PREFIX || parts.length !== 3 || !signature) return '—'
  return `${LICENSE_KEY_PREFIX}…${signature.slice(-MASK_LENGTH)}`
}
