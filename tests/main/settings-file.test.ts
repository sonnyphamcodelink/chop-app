import { describe, expect, it } from 'vitest'
import { DEFAULT_CAPTURE_SHORTCUT } from '../../src/shared/accelerator'
import {
  DEFAULT_SETTINGS,
  parseSettings,
  serializeSettings,
  withCaptureShortcut,
} from '../../src/main/settings-file'

describe('DEFAULT_SETTINGS', () => {
  it('starts on the shipped capture shortcut', () => {
    expect(DEFAULT_SETTINGS.captureShortcut).toBe(DEFAULT_CAPTURE_SHORTCUT)
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
})

describe('serializeSettings', () => {
  it('round-trips through parseSettings', () => {
    const settings = withCaptureShortcut(DEFAULT_SETTINGS, 'Control+Alt+K')
    expect(parseSettings(serializeSettings(settings))).toEqual(settings)
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
