/**
 * What a signed licence key actually says. These claims are signed by the
 * issuer's private key and travel inside the key itself, so the app can answer
 * "is this licence good?" without a server.
 */

/** Editions are sold separately; the app only branches on them if a feature is gated. */
export const EDITIONS = ['personal', 'business'] as const

export type Edition = (typeof EDITIONS)[number]

export type LicenseClaims = {
  /** Order or licence identifier, quoted by the user in support requests. */
  readonly id: string
  /** Who the licence was issued to. Shown in Settings so a key is traceable. */
  readonly email: string
  /** Display name of the licensee; absent when the store did not collect one. */
  readonly name: string | null
  readonly edition: Edition
  /** ISO 8601 instant the key was signed. */
  readonly issuedAt: string
  /** ISO 8601 instant the licence lapses, or null for a perpetual licence. */
  readonly expiresAt: string | null
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** True only for a string an implementation can actually turn into an instant. */
function isInstant(value: string): boolean {
  return Number.isFinite(Date.parse(value))
}

function readEdition(value: unknown): Edition | null {
  return EDITIONS.find((edition) => edition === value) ?? null
}

/**
 * Returns null for anything that is not a complete set of claims. A key whose
 * signature checks out but whose payload is a shape this build does not
 * understand is treated as unusable rather than half-trusted.
 */
export function parseClaims(raw: unknown): LicenseClaims | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>

  const id = readString(record.id)
  const email = readString(record.email)
  const edition = readEdition(record.edition)
  const issuedAt = readString(record.issuedAt)
  if (!id || !email || !edition || !issuedAt || !isInstant(issuedAt)) return null

  // Absent and null both mean perpetual; anything else must be a real instant.
  const rawExpiry = record.expiresAt
  let expiresAt: string | null = null
  if (rawExpiry !== null && rawExpiry !== undefined) {
    expiresAt = readString(rawExpiry)
    if (!expiresAt || !isInstant(expiresAt)) return null
  }

  return { id, email, name: readString(record.name), edition, issuedAt, expiresAt }
}

/** True once `expiresAt` has passed. A perpetual licence never expires. */
export function hasExpired(claims: LicenseClaims, now: number): boolean {
  if (claims.expiresAt === null) return false
  return Date.parse(claims.expiresAt) <= now
}
