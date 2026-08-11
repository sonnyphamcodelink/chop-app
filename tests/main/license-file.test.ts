import { describe, expect, it } from 'vitest'
import {
  EMPTY_LICENSE_FILE,
  parseLicenseFile,
  serializeLicenseFile,
  withLicenseKey,
  withTrialStarted,
} from '../../src/main/license/license-file'

const STAMP = '2026-08-01T00:00:00.000Z'

describe('parseLicenseFile', () => {
  it('reads a stored key and trial stamp', () => {
    expect(parseLicenseFile(`{"key":"CHOP1.a.b","trialStartedAt":"${STAMP}"}`)).toEqual({
      key: 'CHOP1.a.b',
      trialStartedAt: STAMP,
    })
  })

  it('reads an empty file as a first run', () => {
    expect(parseLicenseFile(null)).toEqual(EMPTY_LICENSE_FILE)
    expect(parseLicenseFile('')).toEqual(EMPTY_LICENSE_FILE)
  })

  it('falls back rather than throwing on a file that is not JSON', () => {
    expect(parseLicenseFile('{ broken')).toEqual(EMPTY_LICENSE_FILE)
    expect(parseLicenseFile('"nope"')).toEqual(EMPTY_LICENSE_FILE)
    expect(parseLicenseFile('null')).toEqual(EMPTY_LICENSE_FILE)
  })

  it('drops a key that is not a non-empty string', () => {
    expect(parseLicenseFile('{"key":42}').key).toBeNull()
    expect(parseLicenseFile('{"key":"   "}').key).toBeNull()
  })

  it('drops a stamp that is not an instant, so it is written afresh', () => {
    expect(parseLicenseFile('{"trialStartedAt":"whenever"}').trialStartedAt).toBeNull()
    expect(parseLicenseFile('{"trialStartedAt":123}').trialStartedAt).toBeNull()
  })

  it('trims whitespace around a pasted key', () => {
    expect(parseLicenseFile('{"key":"  CHOP1.a.b  "}').key).toBe('CHOP1.a.b')
  })
})

describe('serializeLicenseFile', () => {
  it('round-trips through parseLicenseFile', () => {
    const file = { key: 'CHOP1.a.b', trialStartedAt: STAMP }
    expect(parseLicenseFile(serializeLicenseFile(file))).toEqual(file)
  })

  it('writes a trailing newline so the file edits cleanly', () => {
    expect(serializeLicenseFile(EMPTY_LICENSE_FILE).endsWith('\n')).toBe(true)
  })
})

describe('withLicenseKey', () => {
  it('returns a new file and leaves the trial stamp alone', () => {
    const file = { key: null, trialStartedAt: STAMP }
    const next = withLicenseKey(file, 'CHOP1.a.b')
    expect(next).toEqual({ key: 'CHOP1.a.b', trialStartedAt: STAMP })
    expect(file.key).toBeNull()
  })

  it('clears the key on deactivation', () => {
    expect(withLicenseKey({ key: 'CHOP1.a.b', trialStartedAt: STAMP }, null).key).toBeNull()
  })
})

describe('withTrialStarted', () => {
  it('stamps a file that has never been stamped', () => {
    expect(withTrialStarted(EMPTY_LICENSE_FILE, STAMP).trialStartedAt).toBe(STAMP)
  })

  it('never moves an existing stamp, so the trial cannot be restarted', () => {
    const file = { key: null, trialStartedAt: STAMP }
    expect(withTrialStarted(file, '2026-09-01T00:00:00.000Z')).toBe(file)
  })
})
