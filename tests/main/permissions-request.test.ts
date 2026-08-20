import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = {
  status: 'denied' as 'granted' | 'denied' | 'not-determined' | 'restricted',
  userData: '',
  getSourcesCalls: 0,
  dialogCalls: 0,
}

vi.mock('electron', () => ({
  app: { getPath: () => fake.userData },
  systemPreferences: { getMediaAccessStatus: () => fake.status },
  desktopCapturer: {
    getSources: async () => {
      fake.getSourcesCalls += 1
      return []
    },
  },
  dialog: {
    showMessageBox: async () => {
      fake.dialogCalls += 1
      return { response: 1 }
    },
  },
  shell: { openExternal: async () => undefined },
}))

/** A fresh module instance, since the request flag is cached in memory. */
async function loadPermissions(): Promise<typeof import('../../src/main/permissions')> {
  vi.resetModules()
  return import('../../src/main/permissions')
}

function withPlatform(platform: NodeJS.Platform): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  return () => {
    if (original) Object.defineProperty(process, 'platform', original)
  }
}

describe('ensureScreenPermission', () => {
  let restore: () => void

  beforeEach(() => {
    restore = withPlatform('darwin')
    fake.status = 'denied'
    fake.userData = mkdtempSync(join(tmpdir(), 'chop-permissions-'))
    fake.getSourcesCalls = 0
    fake.dialogCalls = 0
  })

  afterEach(() => restore())

  it('leaves the first capture to the macOS prompt', async () => {
    const { ensureScreenPermission } = await loadPermissions()

    expect(await ensureScreenPermission()).toBe(false)
    expect(fake.getSourcesCalls).toBe(1)
    expect(fake.dialogCalls).toBe(0)
  })

  it('guides the user itself once macOS has been asked', async () => {
    const { ensureScreenPermission } = await loadPermissions()

    await ensureScreenPermission()
    await ensureScreenPermission()

    expect(fake.getSourcesCalls).toBe(1)
    expect(fake.dialogCalls).toBe(1)
  })

  it('remembers the request across a relaunch', async () => {
    const first = await loadPermissions()
    await first.ensureScreenPermission()

    const second = await loadPermissions()
    await second.ensureScreenPermission()

    expect(fake.getSourcesCalls).toBe(1)
    expect(fake.dialogCalls).toBe(1)
  })

  it('asks for nothing once permission is granted', async () => {
    fake.status = 'granted'
    const { ensureScreenPermission } = await loadPermissions()

    expect(await ensureScreenPermission()).toBe(true)
    expect(fake.getSourcesCalls).toBe(0)
    expect(fake.dialogCalls).toBe(0)
  })
})

describe('requestScreenCaptureAccess', () => {
  let restore: () => void

  beforeEach(() => {
    restore = withPlatform('darwin')
    fake.userData = mkdtempSync(join(tmpdir(), 'chop-permissions-'))
    fake.getSourcesCalls = 0
  })

  afterEach(() => restore())

  it('uses desktopCapturer so macOS lists Chop', async () => {
    const { requestScreenCaptureAccess } = await loadPermissions()

    await requestScreenCaptureAccess()
    expect(fake.getSourcesCalls).toBe(1)
  })
})
