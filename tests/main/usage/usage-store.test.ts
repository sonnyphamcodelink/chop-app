import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const userData = mkdtempSync(join(tmpdir(), 'chop-usage-store-'))

vi.mock('electron', () => ({
  app: { getPath: () => userData },
}))

// device-id.ts spawns a subprocess — mock it so tests are hermetic and fast.
vi.mock('../../../src/main/usage/device-id', () => ({
  resolveDeviceId: async () => ({ deviceId: 'mock-hardware-id', idSource: 'hardware' }),
}))

const { readUsage, writeUsage, recordUsage, markReported, initUsageStore, resetUsageCache } =
  await import('../../../src/main/usage/usage-store')

const usagePath = join(userData, 'usage.json')

beforeEach(() => {
  rmSync(usagePath, { force: true })
  resetUsageCache()
})

afterAll(() => {
  rmSync(userData, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// readUsage
// ---------------------------------------------------------------------------

describe('readUsage', () => {
  it('returns defaults when usage.json does not exist (first run)', () => {
    const file = readUsage()
    expect(file.captures).toBe(0)
    expect(file.deviceId).toBe('')
  })

  it('reads a valid file from disk', () => {
    writeFileSync(
      usagePath,
      JSON.stringify({
        deviceId: 'abc',
        idSource: 'hardware',
        captures: 7,
        imagesSaved: 4,
        imagesCopied: 2,
        pendingSince: null,
        lastReportedDay: '2026-08-18',
      }),
      'utf8',
    )
    resetUsageCache()
    const file = readUsage()
    expect(file.deviceId).toBe('abc')
    expect(file.captures).toBe(7)
    expect(file.lastReportedDay).toBe('2026-08-18')
  })

  it('returns defaults for a corrupt file without throwing', () => {
    writeFileSync(usagePath, '{ bad json', 'utf8')
    resetUsageCache()
    expect(readUsage().captures).toBe(0)
  })

  it('serves from cache on repeated reads', () => {
    const first = readUsage()
    const second = readUsage()
    expect(first).toBe(second) // same reference
  })
})

// ---------------------------------------------------------------------------
// writeUsage
// ---------------------------------------------------------------------------

describe('writeUsage', () => {
  it('persists to disk', () => {
    const file = { ...readUsage(), deviceId: 'persisted', idSource: 'hardware' as const }
    writeUsage(file)
    resetUsageCache()
    expect(readUsage().deviceId).toBe('persisted')
  })
})

// ---------------------------------------------------------------------------
// initUsageStore
// ---------------------------------------------------------------------------

describe('initUsageStore', () => {
  it('populates a missing device id from the mock resolver', async () => {
    await initUsageStore()
    expect(readUsage().deviceId).toBe('mock-hardware-id')
    expect(readUsage().idSource).toBe('hardware')
  })

  it('does not overwrite an existing device id', async () => {
    writeFileSync(
      usagePath,
      JSON.stringify({
        deviceId: 'existing-id',
        idSource: 'hardware',
        captures: 0,
        imagesSaved: 0,
        imagesCopied: 0,
        pendingSince: null,
        lastReportedDay: null,
      }),
      'utf8',
    )
    resetUsageCache()
    await initUsageStore()
    expect(readUsage().deviceId).toBe('existing-id')
  })
})

// ---------------------------------------------------------------------------
// recordUsage
// ---------------------------------------------------------------------------

describe('recordUsage', () => {
  it('increments the captures counter', () => {
    recordUsage('captures')
    expect(readUsage().captures).toBe(1)
    recordUsage('captures')
    expect(readUsage().captures).toBe(2)
  })

  it('increments imagesSaved independently', () => {
    recordUsage('imagesSaved')
    expect(readUsage().imagesSaved).toBe(1)
    expect(readUsage().captures).toBe(0)
  })

  it('increments imagesCopied independently', () => {
    recordUsage('imagesCopied')
    expect(readUsage().imagesCopied).toBe(1)
    expect(readUsage().imagesSaved).toBe(0)
  })

  it('survives a cache reset — the incremented value is on disk', () => {
    recordUsage('captures')
    resetUsageCache()
    expect(readUsage().captures).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// markReported
// ---------------------------------------------------------------------------

describe('markReported', () => {
  it('zeros counters and records the day', () => {
    recordUsage('captures')
    recordUsage('captures')
    recordUsage('imagesSaved')

    markReported('2026-08-19', '2026-08-19T12:00:00.000Z')

    const file = readUsage()
    expect(file.captures).toBe(0)
    expect(file.imagesSaved).toBe(0)
    expect(file.imagesCopied).toBe(0)
    expect(file.lastReportedDay).toBe('2026-08-19')
    expect(file.pendingSince).toBe('2026-08-19T12:00:00.000Z')
  })

  it('persists to disk', () => {
    markReported('2026-08-19', '2026-08-19T12:00:00.000Z')
    resetUsageCache()
    expect(readUsage().lastReportedDay).toBe('2026-08-19')
  })
})
