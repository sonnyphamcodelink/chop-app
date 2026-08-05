import { app, type Tray } from 'electron'
import { runCaptureFlow } from './capture/capture-flow'
import { getEditorWindow, sendCapture } from './editor-window'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { registerEditorHandlers } from './ipc/editor-handlers'
import { defaultCaptureRoot } from './storage/capture-root'
import { createTray } from './tray'

// Held at module scope so the tray is not garbage collected.
let tray: Tray | null = null

async function capture(): Promise<void> {
  const result = await runCaptureFlow()
  if (result) sendCapture(result)
}

// A second instance would fight over the global shortcut and the manifest.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => getEditorWindow().focus())

  void app.whenReady().then(() => {
    // Tests point this at a temp directory so they never touch ~/Pictures.
    const captureRoot = process.env.CHOP_CAPTURE_ROOT ?? defaultCaptureRoot()
    registerEditorHandlers(captureRoot)
    registerHotkeys(() => void capture())

    // E2E seam: the main bundle is a single file, so Playwright cannot import
    // sendCapture directly. Only exposed when a test capture root is set.
    if (process.env.CHOP_CAPTURE_ROOT) {
      ;(globalThis as { __chopSendCapture?: typeof sendCapture }).__chopSendCapture =
        sendCapture
    }
    tray = createTray({
      onCapture: () => void capture(),
      onOpenEditor: () => getEditorWindow().show(),
      captureRoot: () => captureRoot,
    })

    app.on('activate', () => getEditorWindow().show())
  })

  // Closing the editor leaves Chop running in the menu bar, so the hotkey keeps working.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', unregisterHotkeys)
}
