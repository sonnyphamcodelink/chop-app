import { contextBridge, ipcRenderer } from 'electron'
import {
  CHANNELS,
  isSettingsPane,
  type LoginItemState,
  type SettingsPane,
  type ShortcutInfo,
  type ShortcutUpdate,
} from '@shared/ipc'
import type {
  FeedbackContext,
  FeedbackDraft,
  FeedbackResult,
} from '@shared/feedback/types'
import type { ActivationResult, DeactivationResult, LicenseView } from '@shared/license/view'
import type { BackgroundUpdateState } from '@shared/update'

contextBridge.exposeInMainWorld('chopSettings', {
  platform: process.platform,
  getShortcut(): Promise<ShortcutInfo> {
    return ipcRenderer.invoke(CHANNELS.getShortcut) as Promise<ShortcutInfo>
  },
  setShortcut(accelerator: string): Promise<ShortcutUpdate> {
    return ipcRenderer.invoke(CHANNELS.setShortcut, accelerator) as Promise<ShortcutUpdate>
  },
  setRecording(recording: boolean): void {
    ipcRenderer.send(CHANNELS.recordShortcut, recording)
  },
  getOpenAtLogin(): Promise<LoginItemState> {
    return ipcRenderer.invoke(CHANNELS.getOpenAtLogin) as Promise<LoginItemState>
  },
  setOpenAtLogin(enabled: boolean): Promise<LoginItemState> {
    return ipcRenderer.invoke(CHANNELS.setOpenAtLogin, enabled) as Promise<LoginItemState>
  },
  getLicense(): Promise<LicenseView> {
    return ipcRenderer.invoke(CHANNELS.getLicense) as Promise<LicenseView>
  },
  activateLicense(key: string): Promise<ActivationResult> {
    return ipcRenderer.invoke(CHANNELS.activateLicense, key) as Promise<ActivationResult>
  },
  deactivateLicense(): Promise<DeactivationResult> {
    return ipcRenderer.invoke(CHANNELS.deactivateLicense) as Promise<DeactivationResult>
  },
  openPurchasePage(): Promise<void> {
    return ipcRenderer.invoke(CHANNELS.openPurchasePage) as Promise<void>
  },
  getFeedbackContext(): Promise<FeedbackContext> {
    return ipcRenderer.invoke(CHANNELS.getFeedbackContext) as Promise<FeedbackContext>
  },
  sendFeedback(draft: FeedbackDraft): Promise<FeedbackResult> {
    return ipcRenderer.invoke(CHANNELS.sendFeedback, draft) as Promise<FeedbackResult>
  },
  emailFeedback(draft: FeedbackDraft): Promise<boolean> {
    return ipcRenderer.invoke(CHANNELS.emailFeedback, draft) as Promise<boolean>
  },
  getUsageEnabled(): Promise<boolean> {
    return ipcRenderer.invoke(CHANNELS.getUsageEnabled) as Promise<boolean>
  },
  setUsageEnabled(enabled: boolean): Promise<boolean> {
    return ipcRenderer.invoke(CHANNELS.setUsageEnabled, enabled) as Promise<boolean>
  },
  getUpdateState(): Promise<BackgroundUpdateState> {
    return ipcRenderer.invoke(CHANNELS.getUpdateState) as Promise<BackgroundUpdateState>
  },
  relaunchToUpdate(): Promise<boolean> {
    return ipcRenderer.invoke(CHANNELS.relaunchToUpdate) as Promise<boolean>
  },
  onUpdateStateChanged(listener: (state: BackgroundUpdateState) => void): void {
    ipcRenderer.on(CHANNELS.updateStateChanged, (_event, state: BackgroundUpdateState) => {
      listener(state)
    })
  },
  /** Fires when the licence changes anywhere, including in another window. */
  onLicenseChanged(listener: (view: LicenseView) => void): void {
    ipcRenderer.on(CHANNELS.licenseChanged, (_event, view: LicenseView) => listener(view))
  },
  /** Main asks for a pane, e.g. after a capture was refused. */
  onShowPane(listener: (pane: SettingsPane) => void): void {
    ipcRenderer.on(CHANNELS.showSettingsPane, (_event, pane: unknown) => {
      if (isSettingsPane(pane)) listener(pane)
    })
  },
})
