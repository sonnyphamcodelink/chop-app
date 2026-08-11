/**
 * The development seams, checked against a packaged app.
 *
 * Lives apart from `license.test.ts` because `isPackaged` is fixed when the
 * `electron` mock is created, and the whole point of these seams is that a
 * shipped build ignores them — otherwise resetting a trial or accepting a
 * forged key would be an environment variable away.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIssuer, issueKey } from '../helpers/license-keys'
import { TRIAL_DAYS, TRIAL_MS } from '../../src/shared/license/trial'

const userData = mkdtempSync(join(tmpdir(), 'chop-license-packaged-'))

vi.mock('electron', () => ({
  app: { isPackaged: true, getPath: () => userData },
}))

const issuer = createIssuer()

const { currentLicenseStatus, isCaptureLicensed } = await import('../../src/main/license')
const { resetLicenseCache } = await import('../../src/main/license/license-store')

const licensePath = join(userData, 'license.json')

function writeLicenseJson(contents: object): void {
  writeFileSync(licensePath, JSON.stringify(contents), 'utf8')
  resetLicenseCache()
}

beforeEach(() => {
  rmSync(licensePath, { force: true })
  resetLicenseCache()
})

afterAll(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('a packaged build', () => {
  it('ignores CHOP_TRIAL_STARTED_AT, so a lapsed trial cannot be wound back', () => {
    writeLicenseJson({
      key: null,
      trialStartedAt: new Date(Date.now() - TRIAL_MS - 1000).toISOString(),
    })

    vi.stubEnv('CHOP_TRIAL_STARTED_AT', '-0d')
    expect(currentLicenseStatus().kind).toBe('trial-expired')
    expect(isCaptureLicensed()).toBe(false)
    vi.unstubAllEnvs()
  })

  it('ignores CHOP_TRIAL_STARTED_AT in the other direction too', () => {
    writeLicenseJson({ key: null, trialStartedAt: new Date().toISOString() })

    vi.stubEnv('CHOP_TRIAL_STARTED_AT', `-${TRIAL_DAYS + 1}d`)
    expect(currentLicenseStatus()).toMatchObject({ kind: 'trial', daysLeft: TRIAL_DAYS })
    vi.unstubAllEnvs()
  })

  it('ignores CHOP_LICENSE_PUBLIC_KEY, so a key it never signed stays refused', () => {
    writeLicenseJson({ key: issueKey(issuer), trialStartedAt: null })

    vi.stubEnv('CHOP_LICENSE_PUBLIC_KEY', issuer.publicKey)
    expect(currentLicenseStatus().kind).toBe('invalid')
    vi.unstubAllEnvs()
  })
})
