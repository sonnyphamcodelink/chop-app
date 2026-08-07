import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginItemSettingsLike } from '../../src/main/login-item-state'

type Fake = {
  settings: LoginItemSettingsLike
  setCalls: { openAtLogin?: boolean }[]
  opened: string[]
  response: number
  readThrows: boolean
  setThrows: boolean
}

const fake: Fake = {
  settings: { openAtLogin: false, status: 'not-registered' },
  setCalls: [],
  opened: [],
  response: 1,
  readThrows: false,
  setThrows: false,
}

vi.mock('electron', () => ({
  app: {
    getLoginItemSettings: () => {
      if (fake.readThrows) throw new Error('read failed')
      return fake.settings
    },
    setLoginItemSettings: (options: { openAtLogin?: boolean }) => {
      fake.setCalls.push(options)
      if (fake.setThrows) throw new Error('write failed')
      fake.settings = {
        openAtLogin: options.openAtLogin === true,
        status: options.openAtLogin === true ? 'enabled' : 'not-registered',
      }
    },
  },
  dialog: { showMessageBox: async () => ({ response: fake.response }) },
  shell: { openExternal: async (url: string) => void fake.opened.push(url) },
}))

const { LOGIN_ITEMS_SETTINGS_URL, openAtLoginState, setOpenAtLogin } = await import(
  '../../src/main/login-item'
)

/** process.platform is read-only, so tests swap it for the duration of a case. */
function withPlatform(platform: NodeJS.Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  return () => {
    if (original) Object.defineProperty(process, 'platform', original)
  }
}

let restorePlatform = (): void => {}

beforeEach(() => {
  fake.settings = { openAtLogin: false, status: 'not-registered' }
  fake.setCalls = []
  fake.opened = []
  fake.response = 1
  fake.readThrows = false
  fake.setThrows = false
  restorePlatform = withPlatform('darwin')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  restorePlatform()
  vi.restoreAllMocks()
})

describe('openAtLoginState', () => {
  it('reflects the settings the OS reports', () => {
    expect(openAtLoginState()).toBe('disabled')
    fake.settings = { openAtLogin: true, status: 'enabled' }
    expect(openAtLoginState()).toBe('enabled')
  })

  it('reports unsupported on platforms without login items', () => {
    restorePlatform()
    restorePlatform = withPlatform('linux')
    expect(openAtLoginState()).toBe('unsupported')
  })

  it('reports unsupported when the settings cannot be read', () => {
    fake.readThrows = true
    expect(openAtLoginState()).toBe('unsupported')
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('setOpenAtLogin', () => {
  it('registers the app and returns the state read back from the OS', () => {
    expect(setOpenAtLogin(true)).toBe('enabled')
    expect(fake.setCalls).toEqual([{ openAtLogin: true }])
  })

  it('unregisters the app', () => {
    fake.settings = { openAtLogin: true, status: 'enabled' }
    expect(setOpenAtLogin(false)).toBe('disabled')
    expect(fake.setCalls).toEqual([{ openAtLogin: false }])
  })

  it('does not touch the OS on unsupported platforms', () => {
    restorePlatform()
    restorePlatform = withPlatform('linux')
    expect(setOpenAtLogin(true)).toBe('unsupported')
    expect(fake.setCalls).toEqual([])
  })

  it('reports the state that survived a failed write', () => {
    fake.setThrows = true
    expect(setOpenAtLogin(true)).toBe('disabled')
    expect(console.warn).toHaveBeenCalled()
  })

  it('opens System Settings when macOS wants the user to approve the item', async () => {
    fake.response = 0
    fake.setThrows = true // the write leaves the fake settings untouched
    fake.settings = { openAtLogin: true, status: 'requires-approval' }

    expect(setOpenAtLogin(true)).toBe('requires-approval')
    await vi.waitFor(() => expect(fake.opened).toEqual([LOGIN_ITEMS_SETTINGS_URL]))
  })

  it('leaves System Settings alone when the user dismisses the notice', async () => {
    fake.setThrows = true
    fake.settings = { openAtLogin: true, status: 'requires-approval' }

    expect(setOpenAtLogin(true)).toBe('requires-approval')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fake.opened).toEqual([])
  })

  it('stays quiet about approval when turning the item off', async () => {
    fake.response = 0
    fake.setThrows = true
    fake.settings = { openAtLogin: false, status: 'requires-approval' }

    expect(setOpenAtLogin(false)).toBe('requires-approval')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fake.opened).toEqual([])
  })
})
