import { WINDOW_PROVIDER_TIMEOUT_MS } from '@shared/constants'
import { filterCapturableWindows, type WindowRect } from '@shared/window-rect'
import type { WindowProvider } from './types'

export { WINDOW_PROVIDER_TIMEOUT_MS }

/**
 * Wraps a provider so it can never hang or reject. On failure the caller gets an
 * empty list, which degrades capture to region-only selection.
 */
export function withTimeout(provider: WindowProvider, timeoutMs: number): WindowProvider {
  return {
    async listWindows(): Promise<readonly WindowRect[]> {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<readonly WindowRect[]>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`Window provider timed out after ${timeoutMs}ms; region-only capture.`)
          resolve([])
        }, timeoutMs)
      })
      try {
        return await Promise.race([provider.listWindows(), timeout])
      } catch (error) {
        console.warn('Window provider failed; region-only capture.', error)
        return []
      } finally {
        if (timer) clearTimeout(timer)
      }
    },
  }
}

export async function listCapturableWindows(
  provider: WindowProvider,
): Promise<readonly WindowRect[]> {
  return filterCapturableWindows(await provider.listWindows())
}
