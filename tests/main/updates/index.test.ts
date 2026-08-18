import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedResult } from '../../../src/main/updates/release-feed'

const mocks = vi.hoisted(() => ({
  dialog: vi.fn(async () => ({ response: 0 })),
  quit: vi.fn(),
  send: vi.fn(),
  downloadAndPrepare: vi.fn(),
  launchReplacement: vi.fn(async () => undefined),
  discard: vi.fn(async () => undefined),
  discardSync: vi.fn(),
}))

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.2.0',
    getPath: () => '/tmp/logs',
    quit: mocks.quit,
  },
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: mocks.send } }],
  },
  dialog: { showMessageBox: mocks.dialog },
  ipcMain: {
    handle(channel: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(channel, handler)
    },
  },
}))

const feed: FeedResult = {
  ok: true,
  release: {
    tag: 'v0.3.0',
    url: 'https://github.com/sonnyphamcodelink/chop-releases/releases/tag/v0.3.0',
    assets: [
      {
        name: 'Chop-mac-arm64.dmg',
        url: 'https://github.com/sonnyphamcodelink/chop-releases/releases/download/v0.3.0/Chop-mac-arm64.dmg',
        size: 100,
        sha256: 'a'.repeat(64),
      },
    ],
  },
}

vi.mock('../../../src/main/updates/fetch-release', () => ({
  fetchLatestRelease: vi.fn(async () => feed),
}))

vi.mock('../../../src/main/updates/perform-update', () => ({
  downloadAndPrepareUpdate: mocks.downloadAndPrepare,
}))

const { CHANNELS } = await import('../../../src/shared/ipc')
const updates = await import('../../../src/main/updates')

beforeEach(() => {
  handlers.clear()
  vi.clearAllMocks()
  mocks.downloadAndPrepare.mockImplementation(async (_update, options) => {
    options.onProgress({ phase: 'downloading', percent: 40 })
    options.onProgress({ phase: 'preparing' })
    return {
      launchReplacement: mocks.launchReplacement,
      discard: mocks.discard,
      discardSync: mocks.discardSync,
    }
  })
})

describe('background updater', () => {
  it('downloads silently, announces readiness, and installs only after relaunch', async () => {
    const changed = vi.fn()
    updates.registerUpdateHandlers(changed)

    await expect(updates.checkForUpdates({ silent: true })).resolves.toMatchObject({
      kind: 'update-available',
      tag: 'v0.3.0',
    })

    expect(mocks.dialog).not.toHaveBeenCalled()
    expect(mocks.downloadAndPrepare).toHaveBeenCalledOnce()
    expect(updates.currentUpdateState()).toEqual({ phase: 'ready', tag: 'v0.3.0' })
    expect(mocks.launchReplacement).not.toHaveBeenCalled()
    expect(changed).toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledWith(
      CHANNELS.updateStateChanged,
      expect.objectContaining({ phase: 'ready', tag: 'v0.3.0' }),
    )

    expect(handlers.get(CHANNELS.getUpdateState)?.()).toEqual({ phase: 'ready', tag: 'v0.3.0' })
    await expect(handlers.get(CHANNELS.relaunchToUpdate)?.()).resolves.toBe(true)
    expect(mocks.launchReplacement).toHaveBeenCalledOnce()
    expect(mocks.quit).toHaveBeenCalledOnce()
  })
})
