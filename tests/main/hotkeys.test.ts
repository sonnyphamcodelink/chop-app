import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAPTURE_SHORTCUT } from '../../src/shared/accelerator'

/** Accelerators the fake OS refuses, standing in for another app owning them. */
const taken = new Set<string>()
/** Accelerators currently claimed by Chop. */
const claimed = new Set<string>()

vi.mock('electron', () => ({
  globalShortcut: {
    register: (accelerator: string) => {
      if (taken.has(accelerator)) return false
      claimed.add(accelerator)
      return true
    },
    unregister: (accelerator: string) => void claimed.delete(accelerator),
    unregisterAll: () => claimed.clear(),
  },
}))

const {
  captureShortcut,
  changeCaptureShortcut,
  registerHotkeys,
  resumeCaptureShortcut,
  suspendCaptureShortcut,
  unregisterHotkeys,
} = await import('../../src/main/hotkeys')

const capture = (): void => {}

beforeEach(() => {
  taken.clear()
  claimed.clear()
  unregisterHotkeys()
  registerHotkeys(DEFAULT_CAPTURE_SHORTCUT, capture)
})

describe('registerHotkeys', () => {
  it('claims the stored shortcut', () => {
    unregisterHotkeys()
    expect(registerHotkeys('Control+Alt+K', capture)).toBe(true)
    expect(captureShortcut()).toBe('Control+Alt+K')
    expect(claimed.has('Control+Alt+K')).toBe(true)
  })

  it('falls back to the default when the stored shortcut is unusable', () => {
    unregisterHotkeys()
    registerHotkeys('K', capture)
    expect(captureShortcut()).toBe(DEFAULT_CAPTURE_SHORTCUT)
  })

  it('falls back to the default when another app owns the stored shortcut', () => {
    unregisterHotkeys()
    taken.add('Control+Alt+K')
    expect(registerHotkeys('Control+Alt+K', capture)).toBe(true)
    expect(captureShortcut()).toBe(DEFAULT_CAPTURE_SHORTCUT)
  })

  it('reports failure when even the default is taken', () => {
    unregisterHotkeys()
    taken.add(DEFAULT_CAPTURE_SHORTCUT)
    expect(registerHotkeys(DEFAULT_CAPTURE_SHORTCUT, capture)).toBe(false)
  })
})

describe('changeCaptureShortcut', () => {
  it('moves the hotkey and releases the old one', () => {
    const result = changeCaptureShortcut('Control+Alt+K', 'darwin')
    expect(result).toEqual({ ok: true, accelerator: 'Control+Alt+K' })
    expect(claimed.has('Control+Alt+K')).toBe(true)
    expect(claimed.has(DEFAULT_CAPTURE_SHORTCUT)).toBe(false)
  })

  it('refuses a shortcut with no real modifier and keeps the current one', () => {
    const result = changeCaptureShortcut('Shift+K', 'darwin')
    expect(result.ok).toBe(false)
    expect(result.accelerator).toBe(DEFAULT_CAPTURE_SHORTCUT)
    expect(result.error).toContain('Command')
    expect(claimed.has(DEFAULT_CAPTURE_SHORTCUT)).toBe(true)
  })

  it('restores the previous hotkey when another app owns the new one', () => {
    taken.add('Control+Alt+K')
    const result = changeCaptureShortcut('Control+Alt+K', 'darwin')

    expect(result.ok).toBe(false)
    expect(result.accelerator).toBe(DEFAULT_CAPTURE_SHORTCUT)
    expect(captureShortcut()).toBe(DEFAULT_CAPTURE_SHORTCUT)
    expect(claimed.has(DEFAULT_CAPTURE_SHORTCUT)).toBe(true)
  })

  it('accepts the shortcut already in force without dropping it', () => {
    expect(changeCaptureShortcut(DEFAULT_CAPTURE_SHORTCUT, 'darwin').ok).toBe(true)
    expect(claimed.has(DEFAULT_CAPTURE_SHORTCUT)).toBe(true)
  })
})

describe('suspendCaptureShortcut', () => {
  it('releases the hotkey so the recorder can see the keys', () => {
    suspendCaptureShortcut()
    expect(claimed.has(DEFAULT_CAPTURE_SHORTCUT)).toBe(false)
  })

  it('claims it again on resume', () => {
    suspendCaptureShortcut()
    expect(resumeCaptureShortcut()).toBe(true)
    expect(claimed.has(DEFAULT_CAPTURE_SHORTCUT)).toBe(true)
  })

  it('registers the new shortcut when one is chosen while suspended', () => {
    suspendCaptureShortcut()
    expect(changeCaptureShortcut('Control+Alt+K', 'darwin').ok).toBe(true)
    expect(claimed.has('Control+Alt+K')).toBe(true)
    expect(captureShortcut()).toBe('Control+Alt+K')
  })

  it('is safe to resume without having suspended', () => {
    expect(resumeCaptureShortcut()).toBe(true)
    expect(claimed.has(DEFAULT_CAPTURE_SHORTCUT)).toBe(true)
  })
})
