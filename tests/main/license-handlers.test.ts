/**
 * The removal confirmation, checked at the handler rather than in the UI: the
 * prompt lives in the main process precisely so a renderer cannot skip it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIssuer, issueKey } from '../helpers/license-keys'
import type { DeactivationResult } from '../../src/shared/license/view'

const userData = mkdtempSync(join(tmpdir(), 'chop-license-handlers-'))

type Handler = (event: unknown, ...args: unknown[]) => unknown

const handlers = new Map<string, Handler>()
const dialogs: { buttons: string[]; defaultId: number }[] = []
const sent: { channel: string; payload: unknown }[] = []

/** Which button the user "clicks" on the next confirmation. */
let response = 1

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => userData },
  ipcMain: {
    handle: (channel: string, handler: Handler) => void handlers.set(channel, handler),
    on: () => {},
  },
  dialog: {
    showMessageBox: async (...args: unknown[]) => {
      const options = (args.length > 1 ? args[1] : args[0]) as {
        buttons: string[]
        defaultId: number
      }
      dialogs.push(options)
      return { response }
    },
  },
  BrowserWindow: {
    fromWebContents: () => null,
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: unknown) => void sent.push({ channel, payload }),
        },
      },
    ],
  },
  shell: { openExternal: async () => {} },
}))

const issuer = createIssuer()
process.env.CHOP_LICENSE_PUBLIC_KEY = issuer.publicKey

const { registerLicenseHandlers } = await import('../../src/main/ipc/license-handlers')
const { resetLicenseCache } = await import('../../src/main/license/license-store')
const { CHANNELS } = await import('../../src/shared/ipc')

const licensePath = join(userData, 'license.json')
const key = issueKey(issuer)

let changed = 0
registerLicenseHandlers(() => void (changed += 1))

async function deactivate(): Promise<DeactivationResult> {
  const handler = handlers.get(CHANNELS.deactivateLicense)!
  return (await handler({ sender: {} })) as DeactivationResult
}

function installKey(): void {
  writeFileSync(licensePath, JSON.stringify({ key, trialStartedAt: null }), 'utf8')
  resetLicenseCache()
}

beforeEach(() => {
  installKey()
  dialogs.length = 0
  sent.length = 0
  changed = 0
  response = 1
})

afterAll(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe('removing a licence', () => {
  it('always asks first', async () => {
    await deactivate()
    expect(dialogs).toHaveLength(1)
    expect(dialogs[0]?.buttons).toEqual(['Remove', 'Cancel'])
  })

  it('keeps the licence when the user cancels', async () => {
    response = 1

    const result = await deactivate()
    expect(result.removed).toBe(false)
    expect(result.view.status.kind).toBe('licensed')
    expect(result.view.maskedKey).not.toBeNull()
  })

  it('leaves the stored key untouched on cancel', async () => {
    response = 1
    await deactivate()

    resetLicenseCache()
    const handler = handlers.get(CHANNELS.getLicense)!
    expect((handler({}) as { status: { kind: string } }).status.kind).toBe('licensed')
  })

  it('tells nobody the licence changed when it did not', async () => {
    response = 1
    await deactivate()

    expect(sent).toHaveLength(0)
    expect(changed).toBe(0)
  })

  it('removes the licence when the user confirms', async () => {
    response = 0

    const result = await deactivate()
    expect(result.removed).toBe(true)
    expect(result.view.status.kind).not.toBe('licensed')
    expect(result.view.maskedKey).toBeNull()
  })

  it('announces a confirmed removal, so the tray and other windows follow', async () => {
    response = 0
    await deactivate()

    expect(changed).toBe(1)
    expect(sent.map((entry) => entry.channel)).toEqual([CHANNELS.licenseChanged])
  })
})

describe('activating a licence', () => {
  it('never asks for confirmation, since nothing is being lost', async () => {
    const handler = handlers.get(CHANNELS.activateLicense)!
    await handler({}, key)
    expect(dialogs).toHaveLength(0)
  })

  it('refuses a value that is not a string', async () => {
    const handler = handlers.get(CHANNELS.activateLicense)!
    const result = (await handler({}, 42)) as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
