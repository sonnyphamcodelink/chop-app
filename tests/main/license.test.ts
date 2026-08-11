import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIssuer, issueKey, SAMPLE_CLAIMS } from '../helpers/license-keys'
import { TRIAL_DAYS, TRIAL_MS } from '../../src/shared/license/trial'

// The packaged build must ignore the seam entirely, which is asserted in
// `license-packaged.test.ts` against an isPackaged: true app.

const userData = mkdtempSync(join(tmpdir(), 'chop-license-'))

// A development build, so the issuer below is honoured through the env override.
vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => userData },
}))

const issuer = createIssuer()
process.env.CHOP_LICENSE_PUBLIC_KEY = issuer.publicKey

const {
  activateLicense,
  currentLicenseStatus,
  isCaptureLicensed,
  licenseView,
  removeLicense,
  startTrialIfNeeded,
} = await import('../../src/main/license')
const { resetLicenseCache } = await import('../../src/main/license/license-store')

const licensePath = join(userData, 'license.json')
const key = issueKey(issuer)

function writeLicenseJson(contents: object): void {
  writeFileSync(licensePath, JSON.stringify(contents), 'utf8')
  resetLicenseCache()
}

beforeEach(() => {
  rmSync(licensePath, { force: true })
  resetLicenseCache()
  vi.useRealTimers()
})

afterAll(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('startTrialIfNeeded', () => {
  it('stamps the first launch', () => {
    startTrialIfNeeded()
    const { trialStartedAt } = JSON.parse(readFileSync(licensePath, 'utf8'))
    expect(Number.isFinite(Date.parse(trialStartedAt))).toBe(true)
  })

  it('leaves an existing stamp alone, so relaunching cannot extend the trial', () => {
    const stamp = new Date(Date.now() - 5 * 86_400_000).toISOString()
    writeLicenseJson({ key: null, trialStartedAt: stamp })

    startTrialIfNeeded()
    expect(JSON.parse(readFileSync(licensePath, 'utf8')).trialStartedAt).toBe(stamp)
  })
})

describe('currentLicenseStatus', () => {
  it('is a full trial before anything is stamped', () => {
    expect(currentLicenseStatus()).toMatchObject({ kind: 'trial', daysLeft: TRIAL_DAYS })
  })

  it('is a lapsed trial once the term has passed', () => {
    writeLicenseJson({
      key: null,
      trialStartedAt: new Date(Date.now() - TRIAL_MS - 1000).toISOString(),
    })
    expect(currentLicenseStatus().kind).toBe('trial-expired')
    expect(isCaptureLicensed()).toBe(false)
  })

  it('is licensed once a genuine key is stored', () => {
    writeLicenseJson({ key, trialStartedAt: null })
    expect(currentLicenseStatus()).toEqual({ kind: 'licensed', claims: SAMPLE_CLAIMS })
    expect(isCaptureLicensed()).toBe(true)
  })

  it('is invalid when the stored key does not verify', () => {
    writeLicenseJson({ key: issueKey(createIssuer()), trialStartedAt: null })
    expect(currentLicenseStatus().kind).toBe('invalid')
    expect(isCaptureLicensed()).toBe(false)
  })

  it('survives a licence file that is not JSON', () => {
    writeFileSync(licensePath, '{ broken', 'utf8')
    resetLicenseCache()
    expect(currentLicenseStatus().kind).toBe('trial')
  })
})

describe('the CHOP_TRIAL_STARTED_AT seam', () => {
  it('ends the trial on demand, without waiting a month', () => {
    startTrialIfNeeded()
    vi.stubEnv('CHOP_TRIAL_STARTED_AT', `-${TRIAL_DAYS + 1}d`)
    expect(currentLicenseStatus().kind).toBe('trial-expired')
    expect(isCaptureLicensed()).toBe(false)
    vi.unstubAllEnvs()
  })

  it('winds the trial to any point, for checking the countdown', () => {
    vi.stubEnv('CHOP_TRIAL_STARTED_AT', `-${TRIAL_DAYS - 2}d`)
    expect(currentLicenseStatus()).toMatchObject({ kind: 'trial', daysLeft: 2 })
    vi.unstubAllEnvs()
  })

  it('falls back to the real stamp when the value makes no sense', () => {
    const stamp = new Date(Date.now() - TRIAL_MS - 1000).toISOString()
    writeLicenseJson({ key: null, trialStartedAt: stamp })

    vi.stubEnv('CHOP_TRIAL_STARTED_AT', 'yesterday')
    expect(currentLicenseStatus().kind).toBe('trial-expired')
    vi.unstubAllEnvs()
  })

  it('never overrides a licence, which outranks the trial either way', () => {
    writeLicenseJson({ key, trialStartedAt: null })
    vi.stubEnv('CHOP_TRIAL_STARTED_AT', `-${TRIAL_DAYS + 1}d`)
    expect(currentLicenseStatus().kind).toBe('licensed')
    vi.unstubAllEnvs()
  })
})

describe('activateLicense', () => {
  it('installs a genuine key and reports the state it leaves behind', () => {
    const result = activateLicense(key)
    expect(result.ok).toBe(true)
    expect(result.view.status).toEqual({ kind: 'licensed', claims: SAMPLE_CLAIMS })
    expect(JSON.parse(readFileSync(licensePath, 'utf8')).key).toBe(key)
  })

  it('accepts a key that was pasted with line breaks in it', () => {
    expect(activateLicense(`${key.slice(0, 30)}\n  ${key.slice(30)}`).ok).toBe(true)
    expect(JSON.parse(readFileSync(licensePath, 'utf8')).key).toBe(key)
  })

  it('refuses a forged key without writing it', () => {
    const result = activateLicense(issueKey(createIssuer()))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not recognised')
    expect(result.view.status.kind).toBe('trial')
    expect(() => readFileSync(licensePath, 'utf8')).toThrow()
  })

  it('never lets a bad key displace a working licence', () => {
    activateLicense(key)
    expect(activateLicense('CHOP1.nonsense.nonsense').ok).toBe(false)
    expect(currentLicenseStatus().kind).toBe('licensed')
    expect(JSON.parse(readFileSync(licensePath, 'utf8')).key).toBe(key)
  })

  it('asks for a key rather than complaining when the field was empty', () => {
    const result = activateLicense('   ')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Paste your licence key')
  })

  it('keeps the trial stamp, so removing a licence does not grant a fresh trial', () => {
    const stamp = new Date(Date.now() - 3 * 86_400_000).toISOString()
    writeLicenseJson({ key: null, trialStartedAt: stamp })

    activateLicense(key)
    expect(JSON.parse(readFileSync(licensePath, 'utf8')).trialStartedAt).toBe(stamp)
  })
})

describe('removeLicense', () => {
  it('clears the key and falls back to whatever the trial says', () => {
    const stamp = new Date(Date.now() - TRIAL_MS - 1000).toISOString()
    writeLicenseJson({ key, trialStartedAt: stamp })

    expect(removeLicense().status.kind).toBe('trial-expired')
    expect(JSON.parse(readFileSync(licensePath, 'utf8')).key).toBeNull()
  })
})

describe('licenseView', () => {
  it('masks the installed key rather than handing the whole thing to the renderer', () => {
    activateLicense(key)
    const view = licenseView()
    expect(view.maskedKey).not.toBe(key)
    expect(view.maskedKey?.startsWith('CHOP1…')).toBe(true)
    expect(view.maskedKey!.length).toBeLessThan(20)
    expect(view.purchaseUrl.startsWith('https://')).toBe(true)
  })

  it('has no key to show before one is installed', () => {
    expect(licenseView().maskedKey).toBeNull()
  })
})
