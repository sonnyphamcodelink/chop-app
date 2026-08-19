/**
 * Stable device identity for usage reporting.
 *
 * Reads the hardware-level `IOPlatformUUID` from macOS via `ioreg`, then
 * HMAC-SHA256's it with a build constant before it leaves the machine.  The
 * raw UUID is never stored or sent — the HMAC makes it meaningless outside
 * Chop while remaining stable across app reinstall and OS reinstall.
 *
 * If `ioreg` fails, times out, or yields no UUID (VM, locked-down env, etc.)
 * the module falls back to `randomUUID()` and records `idSource: 'random'`
 * so those rows can be filtered when reasoning about retention.
 *
 * The UUID is read once, ever: the result is cached in `usage.json` by the
 * store, so this module only runs on the very first launch.
 */
import { createHmac, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

export type DeviceIdResult = {
  readonly deviceId: string
  readonly idSource: 'hardware' | 'random'
}

/** Build constant — namespaces the id space, not a secret. */
const USAGE_ID_SALT = 'chop-usage-v1'

/** Timeout for the `ioreg` subprocess in milliseconds. */
const IOREG_TIMEOUT_MS = 2_000

/**
 * Parses the `IOPlatformUUID` value out of `ioreg` output.
 * The line of interest looks like:
 *   "IOPlatformUUID" = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
 * Returns null if the key is absent or the value is not a non-empty string.
 */
export function parseIOPlatformUUID(output: string): string | null {
  const match = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(output)
  const uuid = match?.[1]?.trim()
  return uuid ? uuid : null
}

function hmacSha256Hex(key: string, message: string): string {
  return createHmac('sha256', key).update(message).digest('hex')
}

/** Runs `ioreg` and resolves with its stdout, or rejects on timeout/error. */
function runIoreg(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])

    let stdout = ''
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error('ioreg timed out'))
    }, IOREG_TIMEOUT_MS)

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`ioreg exited with code ${code}`))
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

/**
 * Reads the hardware UUID and returns an HMAC'd device id.
 * Falls back to a random UUID if `ioreg` cannot be run or yields no UUID.
 * Never throws.
 */
export async function resolveDeviceId(): Promise<DeviceIdResult> {
  try {
    const output = await runIoreg()
    const uuid = parseIOPlatformUUID(output)
    if (uuid) {
      return {
        deviceId: hmacSha256Hex(USAGE_ID_SALT, uuid),
        idSource: 'hardware',
      }
    }
  } catch {
    // Fall through to the random fallback below.
  }

  return {
    deviceId: randomUUID().replace(/-/g, ''),
    idSource: 'random',
  }
}
