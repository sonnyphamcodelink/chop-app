import { describe, expect, it } from 'vitest'
import {
  APPROVAL_NOTICE,
  type LoginItemSettingsLike,
  loginItemState,
  supportsOpenAtLogin,
} from '../../src/main/login-item-state'

const settings = (
  overrides: Partial<LoginItemSettingsLike> = {},
): LoginItemSettingsLike => ({ openAtLogin: false, ...overrides })

describe('supportsOpenAtLogin', () => {
  it('accepts the platforms Electron can manage login items on', () => {
    expect(supportsOpenAtLogin('darwin')).toBe(true)
    expect(supportsOpenAtLogin('win32')).toBe(true)
  })

  it('rejects platforms without login item support', () => {
    expect(supportsOpenAtLogin('linux')).toBe(false)
    expect(supportsOpenAtLogin('freebsd')).toBe(false)
  })
})

describe('loginItemState', () => {
  it('reports unsupported platforms regardless of settings', () => {
    expect(loginItemState('linux', settings({ openAtLogin: true }))).toBe('unsupported')
  })

  it('reads the flag on Windows, where there is no status field', () => {
    expect(loginItemState('win32', settings({ openAtLogin: true }))).toBe('enabled')
    expect(loginItemState('win32', settings({ openAtLogin: false }))).toBe('disabled')
  })

  it('reads the macOS status field', () => {
    expect(loginItemState('darwin', settings({ openAtLogin: true, status: 'enabled' }))).toBe(
      'enabled',
    )
    expect(
      loginItemState('darwin', settings({ openAtLogin: false, status: 'not-registered' })),
    ).toBe('disabled')
  })

  it('surfaces a registration the user still has to approve', () => {
    expect(
      loginItemState('darwin', settings({ openAtLogin: true, status: 'requires-approval' })),
    ).toBe('requires-approval')
  })

  it('treats approval as pending even when the flag reads false', () => {
    expect(
      loginItemState('darwin', settings({ openAtLogin: false, status: 'requires-approval' })),
    ).toBe('requires-approval')
  })
})

describe('APPROVAL_NOTICE', () => {
  it('offers opening System Settings as the default button', () => {
    expect(APPROVAL_NOTICE.buttons[APPROVAL_NOTICE.defaultId]).toBe('Open System Settings')
  })

  it('lets the user dismiss it', () => {
    expect(APPROVAL_NOTICE.cancelId).not.toBe(APPROVAL_NOTICE.defaultId)
  })
})
