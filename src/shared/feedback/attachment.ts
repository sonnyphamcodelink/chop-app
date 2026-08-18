/**
 * The image a user pastes into the message box. It arrives from the clipboard
 * in the renderer, so unlike a saved capture there is no file behind it — the
 * bytes themselves cross the IPC boundary, and this is where they are checked.
 */

/** Roughly a full-screen Retina screenshot, decoded. */
export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024

const ALLOWED_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/

export type PastedImage = {
  readonly dataUrl: string
  readonly mediaType: string
  /** Size once decoded, which is what actually travels. */
  readonly byteLength: number
}

/** Base64 carries four characters per three bytes, less whatever padding says. */
function decodedLength(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return (payload.length / 4) * 3 - padding
}

/**
 * Narrows a pasted data URL to an image Chop is willing to send, or null.
 * Anything unrecognised is refused rather than repaired.
 */
export function parsePastedImage(value: unknown): PastedImage | null {
  if (typeof value !== 'string') return null

  const match = DATA_URL.exec(value)
  if (!match) return null

  const [, mediaType, payload] = match as unknown as [string, string, string]
  if (!ALLOWED_MEDIA_TYPES.some((allowed) => allowed === mediaType)) return null
  // A payload that is not a whole number of base64 quanta is not base64.
  if (payload.length % 4 !== 0) return null

  const byteLength = decodedLength(payload)
  if (byteLength === 0 || byteLength > ATTACHMENT_MAX_BYTES) return null

  return { dataUrl: value, mediaType, byteLength }
}

/** What the image is called once it leaves, since a paste has no name. */
export function attachmentFileName(mediaType: string): string {
  return `pasted-image.${EXTENSIONS[mediaType] ?? 'png'}`
}

/** For the chip beside the thumbnail, e.g. `1.4 MB`. */
export function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`
  if (byteLength < 1024 * 1024) return `${Math.round(byteLength / 1024)} KB`
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`
}
