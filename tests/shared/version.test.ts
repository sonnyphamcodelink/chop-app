import { describe, expect, it } from 'vitest'
import { compareVersions, isNewerVersion, parseVersion } from '../../src/shared/version'

describe('parseVersion', () => {
  it('parses a plain version', () => {
    expect(parseVersion('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    })
  })

  it('tolerates the leading v that git tags carry', () => {
    expect(parseVersion('v0.1.0')).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
      prerelease: [],
    })
  })

  it('splits prerelease identifiers on dots', () => {
    expect(parseVersion('1.0.0-beta.2')?.prerelease).toEqual(['beta', '2'])
  })

  it('ignores build metadata', () => {
    expect(parseVersion('1.0.0+20260807')).toEqual({
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: [],
    })
  })

  it('trims surrounding whitespace', () => {
    expect(parseVersion('  1.0.0  ')?.major).toBe(1)
  })

  it.each(['', 'latest', '1.2', '1.2.3.4', 'v', '1.2.x', 'release-1.2.3'])(
    'returns null for %o',
    (raw) => {
      expect(parseVersion(raw)).toBeNull()
    },
  )
})

describe('compareVersions', () => {
  const compare = (a: string, b: string): number => {
    const left = parseVersion(a)
    const right = parseVersion(b)
    if (!left || !right) throw new Error(`unparseable fixture: ${a} / ${b}`)
    return compareVersions(left, right)
  }

  it('orders by major, then minor, then patch', () => {
    expect(compare('2.0.0', '1.9.9')).toBeGreaterThan(0)
    expect(compare('1.2.0', '1.1.9')).toBeGreaterThan(0)
    expect(compare('1.1.2', '1.1.1')).toBeGreaterThan(0)
  })

  it('returns zero for equal versions', () => {
    expect(compare('1.2.3', 'v1.2.3')).toBe(0)
  })

  it('compares numeric segments as numbers, not strings', () => {
    expect(compare('0.10.0', '0.9.0')).toBeGreaterThan(0)
  })

  it('ranks a final release above its prereleases', () => {
    expect(compare('1.0.0', '1.0.0-beta')).toBeGreaterThan(0)
    expect(compare('1.0.0-beta', '1.0.0')).toBeLessThan(0)
  })

  it('orders prerelease identifiers left to right', () => {
    expect(compare('1.0.0-beta.2', '1.0.0-beta.1')).toBeGreaterThan(0)
    expect(compare('1.0.0-beta', '1.0.0-alpha')).toBeGreaterThan(0)
  })

  it('ranks numeric prerelease identifiers below alphanumeric ones', () => {
    expect(compare('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0)
  })

  it('ranks a shorter prerelease list first', () => {
    expect(compare('1.0.0-beta', '1.0.0-beta.1')).toBeLessThan(0)
    expect(compare('1.0.0-beta.1', '1.0.0-beta')).toBeGreaterThan(0)
  })

  it('treats identical prerelease lists as equal', () => {
    expect(compare('1.0.0-rc.1', '1.0.0-rc.1')).toBe(0)
  })
})

describe('isNewerVersion', () => {
  it('is true only when the candidate is ahead', () => {
    expect(isNewerVersion('v0.2.0', '0.1.0')).toBe(true)
    expect(isNewerVersion('v0.1.0', '0.1.0')).toBe(false)
    expect(isNewerVersion('v0.0.9', '0.1.0')).toBe(false)
  })

  it('is false when either side is not a version', () => {
    expect(isNewerVersion('nightly', '0.1.0')).toBe(false)
    expect(isNewerVersion('v9.9.9', 'unknown')).toBe(false)
  })
})
