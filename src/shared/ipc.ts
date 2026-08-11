import type { DisplayInfo } from './coords'
import type { Rect } from './geometry'
import type { WindowRect } from './window-rect'

export const CHANNELS = {
  /** main → overlay: frozen image and window rects for one display */
  overlayInit: 'chop:overlay-init',
  /** overlay → main: the user picked a region or window */
  overlaySelection: 'chop:overlay-selection',
  /** overlay → main: the user pressed Escape */
  overlayCancel: 'chop:overlay-cancel',
  /** main → editor: a new capture is ready to edit */
  captureReady: 'chop:capture-ready',
  /** editor → main: persist the flattened image and document; resolves when written */
  saveCapture: 'chop:save-capture',
  /** editor → main: copy the flattened image to the clipboard */
  copyCapture: 'chop:copy-capture',
  /** editor → main: write the flattened image to a user-chosen path */
  saveCaptureAs: 'chop:save-capture-as',
  /** editor → main: list past captures for the filmstrip */
  listCaptures: 'chop:list-captures',
  /** editor → main: load a past capture back into the editor */
  openCapture: 'chop:open-capture',
  /** editor → main: delete a past capture and its sidecar files */
  deleteCapture: 'chop:delete-capture',
  /** main → editor: trigger a new capture from the tray or a shortcut */
  requestCapture: 'chop:request-capture',
  /** renderer → main: the capture shortcut as it stands */
  getShortcut: 'chop:get-shortcut',
  /** settings → main: ask for a new capture shortcut; resolves with what stuck */
  setShortcut: 'chop:set-shortcut',
  /** settings → main: release the hotkey while the recorder is listening */
  recordShortcut: 'chop:record-shortcut',
  /** main → all windows: the capture shortcut changed */
  shortcutChanged: 'chop:shortcut-changed',
  /** settings → main: whether Chop opens at login */
  getOpenAtLogin: 'chop:get-open-at-login',
  /** settings → main: enable/disable open at login; resolves with OS state */
  setOpenAtLogin: 'chop:set-open-at-login',
  /** settings → main: licence state for the License pane */
  getLicense: 'chop:get-license',
  /** settings → main: install a pasted licence key */
  activateLicense: 'chop:activate-license',
  /** settings → main: remove the installed key */
  deactivateLicense: 'chop:deactivate-license',
  /** settings → main: open the store in the system browser */
  openPurchasePage: 'chop:open-purchase-page',
  /** main → all windows: the licence changed */
  licenseChanged: 'chop:license-changed',
  /** main → settings: bring a named pane forward */
  showSettingsPane: 'chop:show-settings-pane',
} as const

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS]

export type LoginItemState = 'enabled' | 'disabled' | 'requires-approval' | 'unsupported'

/** The panes in the Settings sidebar, in the order they are listed. */
export const SETTINGS_PANES = ['general', 'shortcuts', 'license'] as const

export type SettingsPane = (typeof SETTINGS_PANES)[number]

export function isSettingsPane(value: unknown): value is SettingsPane {
  return SETTINGS_PANES.some((pane) => pane === value)
}

/** Sent to each overlay window as it opens. */
export type OverlayInit = {
  readonly display: DisplayInfo
  readonly dataUrl: string
  /** Window rects converted to display-local DIP coordinates. Front to back. */
  readonly windows: readonly WindowRect[]
}

/** Returned when the user commits a selection. */
export type OverlaySelection = {
  readonly displayId: number
  /** Display-local DIP coordinates. */
  readonly rect: Rect
  readonly source: 'region' | 'window'
}

/** A finished capture handed to the editor. */
export type CaptureResult = {
  readonly id: string
  /** PNG data URL of the cropped image at physical resolution. */
  readonly dataUrl: string
  readonly width: number
  readonly height: number
  /** Display scale at capture time (1 on non-Retina, 2 on Retina). */
  readonly scaleFactor: number
  readonly createdAt: string
}

/** The capture shortcut, paired with the spelling shown to the user. */
export type ShortcutInfo = {
  /** Electron accelerator, e.g. `CommandOrControl+Shift+2`. */
  readonly accelerator: string
  /** Ready to display, e.g. `⇧⌘2`. */
  readonly display: string
}

/** Answer to a request to change the shortcut; `shortcut` is what is in force after it. */
export type ShortcutUpdate = {
  readonly ok: boolean
  readonly shortcut: ShortcutInfo
  /** Why the request was refused, for the settings page to show. */
  readonly error?: string
}

/** Sent by the editor whenever the document changes or on close. */
export type SaveRequest = {
  readonly id: string
  /** PNG data URL of the flattened, annotated image. */
  readonly flattenedDataUrl: string
  /** Serialised CaptureDocument. */
  readonly document: unknown
}
