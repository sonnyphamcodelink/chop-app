/**
 * Runs the real issuing scripts and checks the app accepts what they produce.
 *
 * The unit tests mint keys with a helper that mirrors `sign-license.mjs`. This
 * one closes the gap that mirror leaves: if the script and the app ever disagree
 * about the format, every key sold would be rejected, and only an end-to-end
 * run catches it.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LICENSE_PUBLIC_KEY } from '../../src/main/license/public-key'
import { verifyLicenseKey } from '../../src/main/license/verify'

const KEYGEN = resolve('scripts/license-keygen.mjs')
const SIGN = resolve('scripts/sign-license.mjs')

function run(script: string, args: string[] = [], env: NodeJS.ProcessEnv = {}): string {
  return execFileSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

function generatePair(): { publicKey: string; privateKey: string } {
  const output = run(KEYGEN)
  const publicKey = /LICENSE_PUBLIC_KEY = '([^']+)'/.exec(output)?.[1]
  // The private key is the indented line under its own heading.
  const privateKey = /never commit it:\n\n {2}(\S+)/.exec(output)?.[1]
  if (!publicKey || !privateKey) throw new Error(`Could not read a pair from:\n${output}`)
  return { publicKey, privateKey }
}

function issue(privateKey: string, args: string[]): string {
  const output = run(SIGN, args, { CHOP_LICENSE_PRIVATE_KEY: privateKey })
  const key = /^CHOP1\.\S+$/m.exec(output)?.[0]
  if (!key) throw new Error(`Could not read a key from:\n${output}`)
  return key
}

const pair = generatePair()

describe('the issuing scripts', () => {
  it('mint a key the app verifies', () => {
    const key = issue(pair.privateKey, ['--email', 'buyer@example.com', '--id', 'ORDER-1043'])

    expect(verifyLicenseKey(key, pair.publicKey)).toMatchObject({
      id: 'ORDER-1043',
      email: 'buyer@example.com',
      edition: 'personal',
      expiresAt: null,
    })
  })

  it('mint a dated key the app reads the term from', () => {
    const key = issue(pair.privateKey, ['--email', 'buyer@example.com', '--days', '365'])
    const claims = verifyLicenseKey(key, pair.publicKey)

    expect(claims?.expiresAt).not.toBeNull()
    const remaining = Date.parse(claims!.expiresAt!) - Date.now()
    expect(remaining).toBeGreaterThan(364 * 86_400_000)
    expect(remaining).toBeLessThanOrEqual(365 * 86_400_000)
  })

  it('carry the optional fields through the signature', () => {
    const key = issue(pair.privateKey, [
      '--email',
      'buyer@example.com',
      '--name',
      'Ada Lovelace',
      '--edition',
      'business',
    ])

    expect(verifyLicenseKey(key, pair.publicKey)).toMatchObject({
      name: 'Ada Lovelace',
      edition: 'business',
    })
  })

  it('give every key a distinct id when none is supplied', () => {
    const first = verifyLicenseKey(issue(pair.privateKey, ['--email', 'a@example.com']), pair.publicKey)
    const second = verifyLicenseKey(issue(pair.privateKey, ['--email', 'b@example.com']), pair.publicKey)
    expect(first?.id).not.toBe(second?.id)
  })

  it('mint keys that only the matching public key accepts', () => {
    const other = generatePair()
    const key = issue(pair.privateKey, ['--email', 'buyer@example.com'])
    expect(verifyLicenseKey(key, other.publicKey)).toBeNull()
  })

  it('refuse to sign without an email', () => {
    expect(() => issue(pair.privateKey, ['--id', 'ORDER-1'])).toThrow()
  })

  it('refuse to sign an edition the app does not understand', () => {
    expect(() =>
      issue(pair.privateKey, ['--email', 'buyer@example.com', '--edition', 'enterprise']),
    ).toThrow()
  })

  it('refuse to sign without a private key', () => {
    expect(() => run(SIGN, ['--email', 'buyer@example.com'], { CHOP_LICENSE_PRIVATE_KEY: '' })).toThrow()
  })
})

describe('the packaging guard', () => {
  const guard = resolve('scripts/check-license-key.mjs')

  it('agrees with whatever public-key.ts currently says', () => {
    // Blocks `npm run package` until a key is pasted in, and stops blocking
    // the moment one is. Both directions matter, so the test tracks the file.
    const configured = LICENSE_PUBLIC_KEY.trim()

    if (configured) expect(() => run(guard)).not.toThrow()
    else expect(() => run(guard)).toThrow()
  })
})
