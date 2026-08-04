import { describe, expect, it, vi } from 'vitest'
import { createStubWindowProvider } from '../../../src/main/window-providers/stub'
import {
  listCapturableWindows,
  withTimeout,
} from '../../../src/main/window-providers/timeout'
import type { WindowRect } from '@shared/window-rect'
import type { WindowProvider } from '../../../src/main/window-providers/types'

const sample: readonly WindowRect[] = [
  { id: 1, app: 'Real', bounds: { x: 0, y: 0, width: 400, height: 300 } },
  { id: 2, app: 'Sliver', bounds: { x: 0, y: 0, width: 3, height: 300 } },
]

describe('createStubWindowProvider', () => {
  it('returns the fixture windows unchanged', async () => {
    await expect(createStubWindowProvider(sample).listWindows()).resolves.toEqual(sample)
  })
})

describe('withTimeout', () => {
  it('passes through a fast provider result', async () => {
    const provider = createStubWindowProvider(sample)
    await expect(withTimeout(provider, 100).listWindows()).resolves.toEqual(sample)
  })

  it('degrades to an empty list when the provider hangs', async () => {
    const hanging: WindowProvider = { listWindows: () => new Promise(() => {}) }
    await expect(withTimeout(hanging, 20).listWindows()).resolves.toEqual([])
  })

  it('degrades to an empty list when the provider rejects', async () => {
    const failing: WindowProvider = {
      listWindows: () => Promise.reject(new Error('helper crashed')),
    }
    await expect(withTimeout(failing, 100).listWindows()).resolves.toEqual([])
  })

  it('logs the failure rather than swallowing it silently', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing: WindowProvider = {
      listWindows: () => Promise.reject(new Error('helper crashed')),
    }
    await withTimeout(failing, 100).listWindows()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('listCapturableWindows', () => {
  it('drops windows below the minimum dimension', async () => {
    const result = await listCapturableWindows(createStubWindowProvider(sample))
    expect(result.map((w) => w.id)).toEqual([1])
  })
})
