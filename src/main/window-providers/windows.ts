import type { WindowRect } from '@shared/window-rect'
import type { WindowProvider } from './types'

const RECT_BYTES = 16
const DWMWA_EXTENDED_FRAME_BOUNDS = 9
const MAX_TITLE = 512

/** Pure conversion from a Win32 RECT buffer, exported for testing. */
export function rectFromFrameBounds(
  buffer: Buffer,
  id: number,
  app: string,
): WindowRect {
  const left = buffer.readInt32LE(0)
  const top = buffer.readInt32LE(4)
  const right = buffer.readInt32LE(8)
  const bottom = buffer.readInt32LE(12)
  return {
    id,
    app,
    bounds: {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    },
  }
}

export function createWindowsWindowProvider(): WindowProvider {
  return {
    async listWindows(): Promise<readonly WindowRect[]> {
      // Imported lazily so macOS never loads the Windows FFI bindings.
      const koffi = (await import('koffi')).default
      const user32 = koffi.load('user32.dll')
      const dwmapi = koffi.load('dwmapi.dll')

      const GetTopWindow = user32.func('void* GetTopWindow(void*)')
      const GetWindow = user32.func('void* GetWindow(void*, uint32)')
      const IsWindowVisible = user32.func('bool IsWindowVisible(void*)')
      const GetWindowTextA = user32.func('int GetWindowTextA(void*, _Out_ char*, int)')
      const DwmGetWindowAttribute = dwmapi.func(
        'int DwmGetWindowAttribute(void*, uint32, _Out_ void*, uint32)',
      )

      const GW_HWNDNEXT = 2
      const results: WindowRect[] = []
      // GetTopWindow + GW_HWNDNEXT walks the z-order front to back, which is the
      // order the overlay's hit-testing depends on.
      let handle = GetTopWindow(null) as unknown

      for (let index = 0; handle && index < 500; index += 1) {
        if (IsWindowVisible(handle)) {
          const rect = Buffer.alloc(RECT_BYTES)
          const status = DwmGetWindowAttribute(
            handle,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            rect,
            RECT_BYTES,
          )
          if (status === 0) {
            const title = Buffer.alloc(MAX_TITLE)
            const length = GetWindowTextA(handle, title, MAX_TITLE)
            const app = length > 0 ? title.toString('utf8', 0, length) : ''
            const candidate = rectFromFrameBounds(rect, index, app)
            if (candidate.bounds.width > 0 && candidate.bounds.height > 0) {
              results.push(candidate)
            }
          }
        }
        handle = GetWindow(handle, GW_HWNDNEXT) as unknown
      }

      return results
    },
  }
}
