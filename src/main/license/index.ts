/**
 * Licence state for the rest of the main process: what the user is entitled to,
 * and the two operations that change it.
 *
 * Worth being honest about the limits. The check runs inside the app, so anyone
 * willing to edit the bundle can defeat it, and deleting `license.json` restarts
 * the trial. This is a receipt, not a lock: it keeps paying customers on the
 * right side of the line without punishing them for being offline.
 */
import { app } from 'electron'
import type { LicenseClaims } from '@shared/license/claims'
import { canCapture, type LicenseStatus, licenseStatus } from '@shared/license/status'
import { maskLicenseKey, normalizeLicenseKey } from '@shared/license/token'
import { parseTrialOverride } from '@shared/license/trial'
import type { ActivationResult, LicenseView } from '@shared/license/view'
import { licensePublicKey } from './public-key'
import { readLicenseFile, writeLicenseFile } from './license-store'
import { withLicenseKey, withTrialStarted } from './license-file'
import { verifyLicenseKey } from './verify'
import { PURCHASE_URL } from './purchase'

export { PURCHASE_URL } from './purchase'

function verifiedClaims(key: string | null): LicenseClaims | null {
  if (!key) return null
  return verifyLicenseKey(key, licensePublicKey(app.isPackaged))
}

/**
 * When the trial began. A development build honours `CHOP_TRIAL_STARTED_AT`, so
 * the end of the trial can be exercised without waiting a month; a packaged app
 * ignores it, or the trial would be trivially resettable.
 */
function trialStartedAt(stamp: string | null, now: number): number | null {
  if (!app.isPackaged) {
    const override = process.env.CHOP_TRIAL_STARTED_AT
    const parsed = override ? parseTrialOverride(override, now) : null
    if (parsed !== null) return parsed
  }

  if (!stamp) return null
  const parsed = Date.parse(stamp)
  return Number.isFinite(parsed) ? parsed : null
}

/** Entitlement as it stands right now. */
export function currentLicenseStatus(): LicenseStatus {
  const file = readLicenseFile()
  const now = Date.now()

  return licenseStatus({
    claims: verifiedClaims(file.key),
    keyStored: file.key !== null,
    trialStartedAt: trialStartedAt(file.trialStartedAt, now),
    now,
  })
}

/**
 * Stamps the trial clock on the first launch that ever runs. Later launches
 * leave the stamp alone, so the trial cannot be extended by restarting.
 */
export function startTrialIfNeeded(): void {
  const file = readLicenseFile()
  if (file.trialStartedAt) return
  writeLicenseFile(withTrialStarted(file, new Date().toISOString()))
}

/**
 * Installs a key, but only a genuine one — a bad key is reported and never
 * written, so a typo cannot displace a working licence.
 */
export function activateLicense(raw: string): ActivationResult {
  const key = normalizeLicenseKey(raw)
  if (!key) {
    return { ok: false, view: licenseView(), error: 'Paste your licence key first.' }
  }

  const claims = verifyLicenseKey(key, licensePublicKey(app.isPackaged))
  if (!claims) {
    return {
      ok: false,
      view: licenseView(),
      error: 'That key was not recognised. Copy it again from your receipt, all of it.',
    }
  }

  writeLicenseFile(withLicenseKey(readLicenseFile(), key))
  return { ok: true, view: licenseView() }
}

/** Removes the installed key, e.g. before moving the licence to another Mac. */
export function removeLicense(): LicenseView {
  writeLicenseFile(withLicenseKey(readLicenseFile(), null))
  return licenseView()
}

/** What the Settings pane needs to draw itself. */
export function licenseView(): LicenseView {
  const { key } = readLicenseFile()
  return {
    status: currentLicenseStatus(),
    maskedKey: key ? maskLicenseKey(key) : null,
    purchaseUrl: PURCHASE_URL,
  }
}

/** Whether a capture may go ahead. */
export function isCaptureLicensed(): boolean {
  return canCapture(currentLicenseStatus())
}
