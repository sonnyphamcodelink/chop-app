/**
 * Lives apart from `hotkeys.ts` so the accelerator can be asserted without
 * pulling `electron` into the test environment.
 */
export function captureAccelerator(): string {
  return 'CommandOrControl+Shift+2'
}
