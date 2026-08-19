import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPTURE_SHORTCUT } from '../../src/shared/accelerator'
import {
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
  withCaptureShortcut,
  withUsageEnabled,
} from '../../src/main/settings-file'

describe('DEFAULT_SETTINGS', () => {
  it('starts on the shipped capture shortcut', () => {
    expect(DEFAULT_SETTINGS.captureShortcut).toBe(DEFAULT_CAPTURE_SHORTCUT)
  })

  it('defaults usageEnabled to true', () => {
    expect(DEFAULT_SETTINGS.usageEnabled).toBe(true)
  })
})

describe('parseSettings', () => {
  it('reads a stored shortcut', () => {
    expect(parseSettings('{"captureShortcut":"Control+Alt+K"}').captureShortcut).toBe(
      'Control+Alt+K',
    )
  })

  it('falls back to the defaults when nothing has been written yet', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back when the file is not JSON', () => {
    expect(parseSettings('{ broken')).toEqual(DEFAULT_SETTINGS)
  })

  it('falls back when the file holds something other than an object', () => {
    expect(parseSettings('"nope"')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS)
  })

  it('ignores a shortcut that is no longer usable', () => {
    // Hand-edited or written by an older build; a bare key would eat typing.
    expect(parseSettings('{"captureShortcut":"K"}')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('{"captureShortcut":42}')).toEqual(DEFAULT_SETTINGS)
  })

  it('reads usageEnabled: false', () => {
    expect(parseSettings('{"captureShortcut":"CommandOrControl+Shift+2","usageEnabled":false}').usageEnabled).toBe(false)
  })

  it('reads usageEnabled: true', () => {
    expect(parseSettings('{"captureShortcut":"CommandOrControl+Shift+2","usageEnabled":true}').usageEnabled).toBe(true)
  })

  it('defaults usageEnabled to true when the key is absent (existing settings file)', () => {
    expect(parseSettings('{"captureShortcut":"CommandOrControl+Shift+2"}').usageEnabled).toBe(true)
  })

  it('defaults usageEnabled to true when the key is null', () => {
    expect(parseSettings('{"captureShortcut":"CommandOrControl+Shift+2","usageEnabled":null}').usageEnabled).toBe(true)
  })
})

describe('serializeSettings', () => {
  it('round-trips through parseSettings', () => {
    const settings = withCaptureShortcut(DEFAULT_SETTINGS, 'Control+Alt+K')
    expect(parseSettings(serializeSettings(settings))).toEqual(settings)
  })

  it('round-trips usageEnabled: false', () => {
    const settings = withUsageEnabled(DEFAULT_SETTINGS, false)
    expect(parseSettings(serializeSettings(settings)).usageEnabled).toBe(false)
  })

  it('writes a trailing newline so the file edits cleanly', () => {
    expect(serializeSettings(DEFAULT_SETTINGS).endsWith('\n')).toBe(true)
  })
})

describe('withCaptureShortcut', () => {
  it('returns a new settings object', () => {
    const next = withCaptureShortcut(DEFAULT_SETTINGS, 'Control+Alt+K')
    expect(next.captureShortcut).toBe('Control+Alt+K')
    expect(DEFAULT_SETTINGS.captureShortcut).toBe(DEFAULT_CAPTURE_SHORTCUT)
  })
})

describe('withUsageEnabled', () => {
  it('returns a new settings object with usageEnabled toggled off', () => {
    const next = withUsageEnabled(DEFAULT_SETTINGS, false)
    expect(next.usageEnabled).toBe(false)
    expect(DEFAULT_SETTINGS.usageEnabled).toBe(true) // unchanged
  })

  it('returns a new settings object with usageEnabled toggled on', () => {
    const off = withUsageEnabled(DEFAULT_SETTINGS, false)
    const on = withUsageEnabled(off, true)
    expect(on.usageEnabled).toBe(true)
  })

  it('preserves other fields', () => {
    const next = withUsageEnabled(DEFAULT_SETTINGS, false)
    expect(next.captureShortcut).toBe(DEFAULT_SETTINGS.captureShortcut)
  })
})
