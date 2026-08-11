/**
 * The trial-state helper, run against a temp directory rather than a real
 * installation. It exists to make testing a packaged build repeatable, so it
 * had better put the file in the state it claims to.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { parseLicenseFile } from '../../src/main/license/license-file'
import { licenseStatus } from '../../src/shared/license/status'
import { TRIAL_DAYS } from '../../src/shared/license/trial'

const SCRIPT = resolve('scripts/trial-state.mjs')
const userData = mkdtempSync(join(tmpdir(), 'chop-trial-state-'))
const licensePath = join(userData, 'license.json')

function run(args: string[] = []): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, CHOP_USER_DATA: userData },
  })
}

/** The state the app itself would report after the script has run. */
function statusKind(): string {
  const file = parseLicenseFile(readFileSync(licensePath, 'utf8'))
  return licenseStatus({
    claims: null,
    keyStored: file.key !== null,
    trialStartedAt: file.trialStartedAt ? Date.parse(file.trialStartedAt) : null,
    now: Date.now(),
  }).kind
}

beforeEach(() => {
  rmSync(licensePath, { force: true })
})

afterAll(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('npm run trial -- expired', () => {
  it('leaves the app reading the trial as ended', () => {
    run(['expired'])
    expect(statusKind()).toBe('trial-expired')
  })

  it('clears any key, since a licence would outrank the trial being tested', () => {
    writeFileSync(licensePath, JSON.stringify({ key: 'CHOP1.a.b', trialStartedAt: null }), 'utf8')
    run(['expired'])
    expect(parseLicenseFile(readFileSync(licensePath, 'utf8')).key).toBeNull()
  })
})

describe('npm run trial -- ending', () => {
  it('leaves the trial live, with the last couple of days on it', () => {
    run(['ending'])
    expect(statusKind()).toBe('trial')
  })
})

describe('npm run trial -- fresh', () => {
  it('removes the file, so the next launch starts a new trial', () => {
    run(['expired'])
    run(['fresh'])
    expect(existsSync(licensePath)).toBe(false)
  })
})

describe('npm run trial -- unlicense', () => {
  it('drops the key but leaves the stamp, matching what Remove does in the app', () => {
    const trialStartedAt = new Date(Date.now() - 3 * 86_400_000).toISOString()
    writeFileSync(licensePath, JSON.stringify({ key: 'CHOP1.a.b', trialStartedAt }), 'utf8')

    run(['unlicense'])
    const file = parseLicenseFile(readFileSync(licensePath, 'utf8'))
    expect(file.key).toBeNull()
    expect(file.trialStartedAt).toBe(trialStartedAt)
  })
})

describe('npm run trial -- days-ago', () => {
  it('places the start exactly where asked', () => {
    run(['days-ago', '20'])
    const { trialStartedAt } = parseLicenseFile(readFileSync(licensePath, 'utf8'))
    const daysAgo = (Date.now() - Date.parse(trialStartedAt!)) / 86_400_000
    expect(daysAgo).toBeGreaterThan(19.9)
    expect(daysAgo).toBeLessThan(20.1)
  })

  it('agrees with the app about which side of the line that is', () => {
    run(['days-ago', String(TRIAL_DAYS - 1)])
    expect(statusKind()).toBe('trial')
    run(['days-ago', String(TRIAL_DAYS + 1)])
    expect(statusKind()).toBe('trial-expired')
  })

  it('refuses a day count that is not a number', () => {
    expect(() => run(['days-ago', 'twenty'])).toThrow()
    expect(() => run(['days-ago'])).toThrow()
  })
})

describe('the command word', () => {
  it('reports the state without changing it by default', () => {
    run(['expired'])
    const before = readFileSync(licensePath, 'utf8')
    expect(run()).toContain('trial')
    expect(readFileSync(licensePath, 'utf8')).toBe(before)
  })

  it('fails loudly on a word it does not know, rather than quietly doing nothing', () => {
    // A silently ignored argument is how a tester ends up trusting a state the
    // app was never actually put into.
    expect(() => run(['--days-ago', '20'])).toThrow()
    expect(() => run(['bogus'])).toThrow()
  })
})
