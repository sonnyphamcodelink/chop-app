import { app } from 'electron'
import { join } from 'node:path'

/**
 * Lives apart from `paths.ts` because it is the only path helper needing
 * electron. Keeping `paths.ts` electron-free lets the storage tests import it
 * without stubbing the whole module.
 */
export function defaultCaptureRoot(): string {
  return join(app.getPath('pictures'), 'Chop')
}
