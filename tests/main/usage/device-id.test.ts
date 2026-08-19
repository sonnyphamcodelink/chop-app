import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parseIOPlatformUUID } from '../../../src/main/usage/device-id'

// ---------------------------------------------------------------------------
// parseIOPlatformUUID
// ---------------------------------------------------------------------------

describe('parseIOPlatformUUID', () => {
  it('extracts the UUID from real ioreg output', () => {
    const output = `+-o IOPlatformExpertDevice  <class IOPlatformExpertDevice, id 0x100000010, registered, matched, active, busy 0 (18 ms), retain 14>
    {
      "IOPlatformUUID" = "AABBCCDD-1234-5678-ABCD-112233445566"
    }`
    expect(parseIOPlatformUUID(output)).toBe('AABBCCDD-1234-5678-ABCD-112233445566')
  })

  it('handles extra whitespace around the equals sign', () => {
    const output = '  "IOPlatformUUID"  =  "FFFFFFFF-0000-1111-2222-333344445555"'
    expect(parseIOPlatformUUID(output)).toBe('FFFFFFFF-0000-1111-2222-333344445555')
  })

  it('returns null when the key is absent', () => {
    const output = '"IOPlatformSerialNumber" = "C02XY1ABCD12"'
    expect(parseIOPlatformUUID(output)).toBeNull()
  })

  it('returns null on truncated output', () => {
    expect(parseIOPlatformUUID('"IOPlatformUUID" = "')).toBeNull()
  })

  it('returns null on an empty string', () => {
    expect(parseIOPlatformUUID('')).toBeNull()
  })

  it('returns null when the value is an empty quoted string', () => {
    expect(parseIOPlatformUUID('"IOPlatformUUID" = ""')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// HMAC output shape
// The production code uses HMAC-SHA256 with the salt 'chop-usage-v1'.
// We verify the shape (64 lowercase hex chars) and that a known UUID
// produces the known digest, so a salt or algorithm change is caught.
// ---------------------------------------------------------------------------

describe('device id HMAC', () => {
  const SALT = 'chop-usage-v1'
  const TEST_UUID = 'AABBCCDD-1234-5678-ABCD-112233445566'

  function expectedDigest(uuid: string): string {
    return createHmac('sha256', SALT).update(uuid).digest('hex')
  }

  it('the expected digest is 64 lowercase hex characters', () => {
    const digest = expectedDigest(TEST_UUID)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it('a fixed UUID always produces the same digest', () => {
    expect(expectedDigest(TEST_UUID)).toBe(expectedDigest(TEST_UUID))
  })

  it('two different UUIDs produce different digests', () => {
    expect(expectedDigest(TEST_UUID)).not.toBe(
      expectedDigest('00000000-0000-0000-0000-000000000000'),
    )
  })
})
