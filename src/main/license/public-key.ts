/**
 * The Ed25519 public key licence keys are checked against.
 *
 * Only the public half ever ships. The private half signs keys on your machine
 * and must never enter this repo — anyone holding it can mint licences.
 *
 * Run `npm run license:keygen` to generate a pair, then paste the public half
 * below. `npm run package` refuses to build while this is still empty, so an
 * unsigned build cannot reach a customer.
 */

/** Base64 of the SPKI DER encoding, as printed by `npm run license:keygen`. */
export const LICENSE_PUBLIC_KEY = 'MCowBQYDK2VwAyEA9IzFWDGElp2S3QYapfW8dUu9GOEdFd69mKj3nmnX4sc='

/**
 * The key in force. The environment variable exists so a test build can be
 * pointed at a throwaway pair without editing this file; a packaged app ignores
 * anything but the constant above.
 */
export function licensePublicKey(isPackaged: boolean): string {
  if (!isPackaged) {
    const override = process.env.CHOP_LICENSE_PUBLIC_KEY?.trim()
    if (override) return override
  }
  return LICENSE_PUBLIC_KEY.trim()
}

/** Wraps the stored base64 in the PEM envelope `node:crypto` expects. */
export function toPublicKeyPem(base64: string): string {
  const body = base64.replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? ''
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`
}
