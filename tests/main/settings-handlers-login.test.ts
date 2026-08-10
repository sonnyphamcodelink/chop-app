import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginItemState } from '../../src/shared/ipc'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle(channel: string, fn: (...args: unknown[]) => unknown) {
      handlers.set(channel, fn)
    },
    on() {},
  },
}))

const openAtLoginState = vi.fn((): LoginItemState => 'disabled')
const setOpenAtLogin = vi.fn((enabled: boolean): LoginItemState =>
  enabled ? 'enabled' : 'disabled',
)

vi.mock('../../src/main/login-item', () => ({
  openAtLoginState: () => openAtLoginState(),
  setOpenAtLogin: (enabled: boolean) => setOpenAtLogin(enabled),
}))

vi.mock('../../src/main/hotkeys', () => ({
  captureShortcut: () => 'CommandOrControl+Shift+2',
  changeCaptureShortcut: () => ({ ok: true, accelerator: 'CommandOrControl+Shift+2' }),
  resumeCaptureShortcut: () => {},
  suspendCaptureShortcut: () => {},
}))

vi.mock('../../src/main/settings-store', () => ({
  readSettings: () => ({ captureShortcut: 'CommandOrControl+Shift+2' }),
  writeSettings: () => {},
}))

vi.mock('../../src/main/settings-file', () => ({
  withCaptureShortcut: (s: unknown) => s,
}))

const { CHANNELS } = await import('../../src/shared/ipc')
const { registerSettingsHandlers } = await import('../../src/main/ipc/settings-handlers')

beforeEach(() => {
  handlers.clear()
  openAtLoginState.mockReset()
  setOpenAtLogin.mockReset()
  openAtLoginState.mockReturnValue('disabled')
  setOpenAtLogin.mockImplementation((enabled: boolean) => (enabled ? 'enabled' : 'disabled'))
  registerSettingsHandlers(() => {})
})

describe('open-at-login settings IPC', () => {
  it('reports the current login item state', () => {
    openAtLoginState.mockReturnValue('enabled')
    const result = handlers.get(CHANNELS.getOpenAtLogin)?.()
    expect(result).toBe('enabled')
  })

  it('forwards enable/disable to setOpenAtLogin and returns the OS state', () => {
    setOpenAtLogin.mockReturnValue('requires-approval')
    const result = handlers.get(CHANNELS.setOpenAtLogin)?.({}, true)
    expect(setOpenAtLogin).toHaveBeenCalledWith(true)
    expect(result).toBe('requires-approval')
  })

  it('rejects a non-boolean enable flag without calling the OS', () => {
    const result = handlers.get(CHANNELS.setOpenAtLogin)?.({}, 'yes')
    expect(setOpenAtLogin).not.toHaveBeenCalled()
    expect(result).toBe('disabled')
  })
})
