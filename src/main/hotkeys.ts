import { globalShortcut } from 'electron'
import { captureAccelerator } from './hotkey-accelerator'

export { captureAccelerator }

/** Returns false when another app already owns the shortcut. */
export function registerHotkeys(onCapture: () => void): boolean {
  const accelerator = captureAccelerator()
  const registered = globalShortcut.register(accelerator, onCapture)
  if (!registered) {
    console.warn(`Could not register ${accelerator}; another app may be using it.`)
  }
  return registered
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
