import { contextBridge, ipcRenderer } from 'electron'
import {
  CHANNELS,
  isSettingsPane,
  type LoginItemState,
  type SettingsPane,
  type ShortcutInfo,
  type ShortcutUpdate,
} from '@shared/ipc'
import type { ActivationResult, DeactivationResult, LicenseView } from '@shared/license/view'

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
