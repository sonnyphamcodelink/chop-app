import { describe, expect, it } from 'vitest'
import type { LicenseStatus } from '../../src/shared/license/status'
import {
  BUY_BUTTON,
  DISMISS_BUTTON,
  ENTER_KEY_BUTTON,
  KEEP_BUTTON,
  licenseNotice,
  REMOVE_BUTTON,
  removeLicenseNotice,
} from '../../src/main/license/notice'
import { isSafePurchaseUrl, PURCHASE_URL } from '../../src/main/license/purchase'
import { SAMPLE_CLAIMS } from '../helpers/license-keys'

const BLOCKING: LicenseStatus[] = [
  { kind: 'trial-expired', endsAt: '2026-08-01T00:00:00.000Z' },
  { kind: 'expired', claims: { ...SAMPLE_CLAIMS, expiresAt: '2026-08-01T00:00:00.000Z' } },
  { kind: 'invalid' },
]

describe('licenseNotice', () => {
  it('offers the same three ways out whatever the reason', () => {
    for (const status of BLOCKING) {
      const notice = licenseNotice(status)
      expect(notice.buttons).toEqual(['Enter Licence…', 'Buy Chop', 'Not Now'])
      expect(notice.defaultId).toBe(ENTER_KEY_BUTTON)
      expect(notice.cancelId).toBe(DISMISS_BUTTON)
    }
  })

  it('keeps the button indices the gate switches on in step with the labels', () => {
    const { buttons } = licenseNotice({ kind: 'invalid' })
    expect(buttons[ENTER_KEY_BUTTON]).toBe('Enter Licence…')
    expect(buttons[BUY_BUTTON]).toBe('Buy Chop')
    expect(buttons[DISMISS_BUTTON]).toBe('Not Now')
  })

  it('titles each reason distinctly', () => {
    expect(licenseNotice(BLOCKING[0]!).title).toBe('Trial ended')
    expect(licenseNotice(BLOCKING[1]!).title).toBe('Licence expired')
    expect(licenseNotice(BLOCKING[2]!).title).toBe('Licence not recognised')
  })

  it('reassures the user that their captures are untouched', () => {
    for (const status of BLOCKING) {
      expect(licenseNotice(status).detail).toContain('past captures')
    }
  })
})

describe('removeLicenseNotice', () => {
  const licensed: LicenseStatus = { kind: 'licensed', claims: SAMPLE_CLAIMS }

  it('defaults to keeping the licence, so Return does not remove it', () => {
    const notice = removeLicenseNotice(licensed)
    expect(notice.buttons[REMOVE_BUTTON]).toBe('Remove')
    expect(notice.buttons[KEEP_BUTTON]).toBe('Cancel')
    expect(notice.defaultId).toBe(KEEP_BUTTON)
    expect(notice.cancelId).toBe(KEEP_BUTTON)
  })

  it('says the key can be pasted back, so removal does not read as final', () => {
    expect(removeLicenseNotice(licensed).detail).toContain('again')
    expect(removeLicenseNotice(licensed).detail).toContain('receipt')
  })

  it('warns a licensed user that the trial behind it may already be gone', () => {
    expect(removeLicenseNotice(licensed).detail).toContain('may already have ended')
  })

  it('does not repeat that warning when no licence is in force', () => {
    expect(removeLicenseNotice({ kind: 'invalid' }).detail).not.toContain('may already have ended')
  })
})

describe('PURCHASE_URL', () => {
  it('is https, because it is handed to the system browser', () => {
    expect(isSafePurchaseUrl(PURCHASE_URL)).toBe(true)
  })

  it('rejects a scheme that is not https', () => {
    expect(isSafePurchaseUrl('http://example.com')).toBe(false)
    expect(isSafePurchaseUrl('file:///etc/passwd')).toBe(false)
  })
})
