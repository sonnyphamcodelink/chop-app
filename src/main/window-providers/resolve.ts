import { app } from 'electron'
import { join } from 'node:path'
import { WINDOW_PROVIDER_TIMEOUT_MS } from '@shared/constants'
import type { WindowRect } from '@shared/window-rect'
import { createMacOsWindowProvider } from './macos'
import { createStubWindowProvider } from './stub'
import { withTimeout } from './timeout'
import type { WindowProvider } from './types'

function helperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'windowlist')
    : join(app.getAppPath(), 'resources', 'windowlist')
}

export function resolveWindowProvider(): WindowProvider {
  const stubFixture = process.env.CHOP_STUB_WINDOWS
  if (stubFixture) {
    return createStubWindowProvider(JSON.parse(stubFixture) as readonly WindowRect[])
  }
  if (process.platform === 'darwin') {
    return withTimeout(createMacOsWindowProvider(helperPath()), WINDOW_PROVIDER_TIMEOUT_MS)
  }
  // Windows support is added in Task 26. Until then, region-only capture.
  return createStubWindowProvider([])
}
