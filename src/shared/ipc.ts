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
  /** editor → main: persist the flattened image and document */
  saveCapture: 'chop:save-capture',
  /** editor → main: copy the flattened image to the clipboard */
  copyCapture: 'chop:copy-capture',
  /** editor → main: write the flattened image to a user-chosen path */
  saveCaptureAs: 'chop:save-capture-as',
  /** editor → main: list past captures for the filmstrip */
  listCaptures: 'chop:list-captures',
  /** editor → main: load a past capture back into the editor */
  openCapture: 'chop:open-capture',
  /** main → editor: trigger a new capture from the tray or a shortcut */
  requestCapture: 'chop:request-capture',
} as const

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS]

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
  readonly createdAt: string
}

/** Sent by the editor whenever the document changes or on close. */
export type SaveRequest = {
  readonly id: string
  /** PNG data URL of the flattened, annotated image. */
  readonly flattenedDataUrl: string
  /** Serialised CaptureDocument. */
  readonly document: unknown
}
