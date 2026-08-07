/**
 * Just enough semver to answer one question: is a published release newer than
 * the version running? Versions arrive as git tags, so a leading `v` is
 * tolerated, and build metadata is ignored the way semver says it should be.
 */

export type Version = {
  readonly major: number
  readonly minor: number
  readonly patch: number
  /** Dot-separated prerelease identifiers; empty for a final release. */
  readonly prerelease: readonly string[]
}

const IDENTIFIERS = '[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*'
const VERSION_PATTERN = new RegExp(
  `^v?(\\d+)\\.(\\d+)\\.(\\d+)(?:-(${IDENTIFIERS}))?(?:\\+${IDENTIFIERS})?$`,
)

const NUMERIC = /^\d+$/

export function parseVersion(raw: string): Version | null {
  const match = VERSION_PATTERN.exec(raw.trim())
  if (!match) return null
  const prerelease = match[4]
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: prerelease ? prerelease.split('.') : [],
  }
}

function compareIdentifiers(a: string, b: string): number {
  const aNumeric = NUMERIC.test(a)
  const bNumeric = NUMERIC.test(b)
  // Numeric identifiers always sort below alphanumeric ones.
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1
  if (aNumeric && bNumeric) return Number(a) - Number(b)
  if (a === b) return 0
  return a < b ? -1 : 1
}

function comparePrerelease(a: readonly string[], b: readonly string[]): number {
  // A final release outranks any prerelease of the same core version.
  if (a.length === 0 || b.length === 0) return b.length - a.length

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i]
    const right = b[i]
    // The shorter identifier list sorts first: 1.0.0-beta precedes 1.0.0-beta.1.
    if (left === undefined) return -1
    if (right === undefined) return 1
    const result = compareIdentifiers(left, right)
    if (result !== 0) return result
  }
  return 0
}

/** Negative when `a` precedes `b`, positive when it follows, zero when equal. */
export function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  return comparePrerelease(a.prerelease, b.prerelease)
}

/**
 * False when either string is not a version, so a stray tag in the release feed
 * can never prompt someone to "upgrade" to something unrecognisable.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const parsedCandidate = parseVersion(candidate)
  const parsedCurrent = parseVersion(current)
  if (!parsedCandidate || !parsedCurrent) return false
  return compareVersions(parsedCandidate, parsedCurrent) > 0
}
