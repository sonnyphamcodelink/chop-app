import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WindowRect } from '@shared/window-rect'
import type { WindowProvider } from './types'

const execFileAsync = promisify(execFile)

type HelperEntry = Record<string, unknown>

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Parses the Swift helper's JSON output. Exported for testing without spawning. */
export function parseHelperOutput(stdout: string): readonly WindowRect[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error('window helper returned malformed JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('window helper returned a non-array payload')
  }

  return parsed.flatMap((raw: HelperEntry): readonly WindowRect[] => {
    const { id, x, y, width, height, app } = raw
    if (
      !isFiniteNumber(id) ||
      !isFiniteNumber(x) ||
      !isFiniteNumber(y) ||
      !isFiniteNumber(width) ||
      !isFiniteNumber(height)
    ) {
      return []
    }
    return [{ id, app: typeof app === 'string' ? app : '', bounds: { x, y, width, height } }]
  })
}

export function createMacOsWindowProvider(helperPath: string): WindowProvider {
  return {
    async listWindows(): Promise<readonly WindowRect[]> {
      const { stdout } = await execFileAsync(helperPath, [], { encoding: 'utf8' })
      return parseHelperOutput(stdout)
    },
  }
}
