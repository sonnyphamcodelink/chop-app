import { app } from 'electron'
import { runCaptureFlow } from './capture/capture-flow'
import { warmOverlays } from './capture/overlay-manager'
import { getEditorWindow, sendCapture } from './editor-window'
import { captureShortcut, registerHotkeys, unregisterHotkeys } from './hotkeys'
import { registerEditorHandlers } from './ipc/editor-handlers'
import { registerSettingsHandlers } from './ipc/settings-handlers'
import { readSettings } from './settings-store'
import { openSettingsWindow } from './settings-window'
import { defaultCaptureRoot } from './storage/capture-root'
import { createTray, type TrayController } from './tray'
import { checkForUpdates } from './updates'

// Held at module scope so the tray is not garbage collected.
let tray: TrayController | null = null

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
    registerHotkeys(readSettings().captureShortcut, () => void capture())
    // The tray shows the accelerator, so it redraws whenever it changes.
    registerSettingsHandlers(() => tray?.refresh())

    // E2E seam: the main bundle is a single file, so Playwright cannot import
    // sendCapture directly. Only exposed when a test capture root is set.
    if (process.env.CHOP_CAPTURE_ROOT) {
      ;(globalThis as { __chopSendCapture?: typeof sendCapture }).__chopSendCapture =
        sendCapture
    }
    tray = createTray({
      onCapture: () => void capture(),
      onOpenEditor: () => getEditorWindow().show(),
      onOpenSettings: () => openSettingsWindow(),
      onCheckForUpdates: () => void checkForUpdates({ silent: false }),
      captureShortcut,
      captureRoot: () => captureRoot,
    })

    // Build hidden overlay and editor windows now, so the first hotkey press
    // only pays for the screenshot, not window creation and page loads.
    void warmOverlays()
    getEditorWindow()

    // A dev build always looks stale against the newest release, so it never asks.
    if (app.isPackaged) void checkForUpdates({ silent: true })

    app.on('activate', () => getEditorWindow().show())
  })

  // Closing the editor leaves Chop running in the menu bar, so the hotkey keeps working.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', unregisterHotkeys)
}
