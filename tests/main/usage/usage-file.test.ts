import { describe, expect, it } from 'vitest'
import {
  DEFAULT_USAGE_FILE,
  parseUsageFile,
  serializeUsageFile,
  withDeviceId,
  withIncrementedCounter,
  withLastReportedDay,
  withReportSent,
  type UsageFile,
} from '../../../src/main/usage/usage-file'

// ---------------------------------------------------------------------------
// parseUsageFile
// ---------------------------------------------------------------------------

const VALID_FILE: UsageFile = {
  deviceId: 'abcd1234',
  idSource: 'hardware',
  captures: 3,
  imagesSaved: 2,
  imagesCopied: 1,
  pendingSince: '2026-08-18T09:12:44.101Z',
  lastReportedDay: '2026-08-18',
}

describe('parseUsageFile', () => {
  it('round-trips a valid file', () => {
    expect(parseUsageFile(JSON.stringify(VALID_FILE))).toEqual(VALID_FILE)
  })

  it('falls back to defaults when the input is null', () => {
    expect(parseUsageFile(null)).toEqual(DEFAULT_USAGE_FILE)
  })

  it('falls back to defaults when the file is not JSON', () => {
    expect(parseUsageFile('{ broken')).toEqual(DEFAULT_USAGE_FILE)
  })

  it('falls back when the file holds something other than an object', () => {
    expect(parseUsageFile('"nope"')).toEqual(DEFAULT_USAGE_FILE)
    expect(parseUsageFile('null')).toEqual(DEFAULT_USAGE_FILE)
    expect(parseUsageFile('42')).toEqual(DEFAULT_USAGE_FILE)
  })

  it('falls back when deviceId is missing', () => {
    const { deviceId: _omit, ...rest } = VALID_FILE
    expect(parseUsageFile(JSON.stringify(rest))).toEqual(DEFAULT_USAGE_FILE)
  })

  it('falls back when deviceId is an empty string', () => {
    expect(parseUsageFile(JSON.stringify({ ...VALID_FILE, deviceId: '  ' }))).toEqual(
      DEFAULT_USAGE_FILE,
    )
  })

  it('defaults idSource to random for an unrecognised value', () => {
    const result = parseUsageFile(JSON.stringify({ ...VALID_FILE, idSource: 'chip' }))
    expect(result.idSource).toBe('random')
  })

  it('coerces negative counters to 0', () => {
    const result = parseUsageFile(
      JSON.stringify({ ...VALID_FILE, captures: -5, imagesSaved: -1, imagesCopied: -99 }),
    )
    expect(result.captures).toBe(0)
    expect(result.imagesSaved).toBe(0)
    expect(result.imagesCopied).toBe(0)
  })

  it('coerces non-integer counter values to 0', () => {
    const result = parseUsageFile(
      JSON.stringify({ ...VALID_FILE, captures: 'ten', imagesSaved: null }),
    )
    expect(result.captures).toBe(0)
    expect(result.imagesSaved).toBe(0)
  })

  it('truncates fractional counters', () => {
    const result = parseUsageFile(JSON.stringify({ ...VALID_FILE, captures: 3.9 }))
    expect(result.captures).toBe(3)
  })

  it('accepts null for pendingSince and lastReportedDay', () => {
    const result = parseUsageFile(
      JSON.stringify({ ...VALID_FILE, pendingSince: null, lastReportedDay: null }),
    )
    expect(result.pendingSince).toBeNull()
    expect(result.lastReportedDay).toBeNull()
  })

  it('rejects an invalid ISO instant for pendingSince', () => {
    const result = parseUsageFile(JSON.stringify({ ...VALID_FILE, pendingSince: 'not-a-date' }))
    expect(result.pendingSince).toBeNull()
  })

  it('rejects a non-YYYY-MM-DD string for lastReportedDay', () => {
    const result = parseUsageFile(JSON.stringify({ ...VALID_FILE, lastReportedDay: '19/08/2026' }))
    expect(result.lastReportedDay).toBeNull()
  })

  it('ignores unknown extra keys without failing', () => {
    const result = parseUsageFile(
      JSON.stringify({ ...VALID_FILE, futureField: 'hello' }),
    )
    expect(result.deviceId).toBe(VALID_FILE.deviceId)
    expect(result.captures).toBe(VALID_FILE.captures)
  })
})

// ---------------------------------------------------------------------------
// serializeUsageFile
// ---------------------------------------------------------------------------

describe('serializeUsageFile', () => {
  it('round-trips through parseUsageFile', () => {
    expect(parseUsageFile(serializeUsageFile(VALID_FILE))).toEqual(VALID_FILE)
  })

  it('writes a trailing newline', () => {
    expect(serializeUsageFile(VALID_FILE).endsWith('\n')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Immutable updaters
// ---------------------------------------------------------------------------

describe('withIncrementedCounter', () => {
  it('increments captures without mutating the input', () => {
    const next = withIncrementedCounter(VALID_FILE, 'captures')
    expect(next.captures).toBe(VALID_FILE.captures + 1)
    expect(VALID_FILE.captures).toBe(3) // unchanged
  })

  it('increments imagesSaved', () => {
    const next = withIncrementedCounter(VALID_FILE, 'imagesSaved')
    expect(next.imagesSaved).toBe(VALID_FILE.imagesSaved + 1)
  })

  it('increments imagesCopied', () => {
    const next = withIncrementedCounter(VALID_FILE, 'imagesCopied')
    expect(next.imagesCopied).toBe(VALID_FILE.imagesCopied + 1)
  })

  it('leaves all other fields unchanged', () => {
    const next = withIncrementedCounter(VALID_FILE, 'captures')
    expect(next.deviceId).toBe(VALID_FILE.deviceId)
    expect(next.imagesSaved).toBe(VALID_FILE.imagesSaved)
    expect(next.imagesCopied).toBe(VALID_FILE.imagesCopied)
    expect(next.lastReportedDay).toBe(VALID_FILE.lastReportedDay)
  })
})

describe('withDeviceId', () => {
  it('writes both id and source', () => {
    const next = withDeviceId(DEFAULT_USAGE_FILE, 'deadbeef', 'hardware')
    expect(next.deviceId).toBe('deadbeef')
    expect(next.idSource).toBe('hardware')
  })

  it('does not mutate the input', () => {
    withDeviceId(DEFAULT_USAGE_FILE, 'deadbeef', 'hardware')
    expect(DEFAULT_USAGE_FILE.deviceId).toBe('')
  })
})

describe('withReportSent', () => {
  const NOW = '2026-08-19T10:00:00.000Z'

  it('zeros all three counters', () => {
    const next = withReportSent(VALID_FILE, NOW)
    expect(next.captures).toBe(0)
    expect(next.imagesSaved).toBe(0)
    expect(next.imagesCopied).toBe(0)
  })

  it('sets pendingSince to now', () => {
    const next = withReportSent(VALID_FILE, NOW)
    expect(next.pendingSince).toBe(NOW)
  })

  it('does not touch lastReportedDay', () => {
    const next = withReportSent(VALID_FILE, NOW)
    expect(next.lastReportedDay).toBe(VALID_FILE.lastReportedDay)
  })

  it('does not mutate the input', () => {
    withReportSent(VALID_FILE, NOW)
    expect(VALID_FILE.captures).toBe(3)
  })
})

describe('withLastReportedDay', () => {
  it('records the day', () => {
    const next = withLastReportedDay(VALID_FILE, '2026-08-19')
    expect(next.lastReportedDay).toBe('2026-08-19')
  })

  it('does not mutate the input', () => {
    withLastReportedDay(VALID_FILE, '2026-08-19')
    expect(VALID_FILE.lastReportedDay).toBe('2026-08-18')
  })
})
