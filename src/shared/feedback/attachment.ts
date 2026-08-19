/**
 * The images a user pastes into the message box. They arrive from the clipboard
 * in the renderer, so unlike a saved capture there is no file behind them — the
 * bytes themselves cross the IPC boundary, and this is where they are checked.
 */

/** Roughly a full-screen Retina screenshot, decoded. */
export const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024

/**
 * How many images ride along at most. Three covers "before, after, and the
 * settings I had" without turning the pane into a gallery.
 */
export const MAX_ATTACHMENTS = 3

/**
 * What Chop will even attempt to open. A paste is shrunk before it is measured
 * against ATTACHMENT_MAX_BYTES, so the first gate has to be looser than the
 * second — but not unbounded, or a bad paste could stall the renderer.
 */
export const RAW_PASTE_MAX_BYTES = 64 * 1024 * 1024

/**
 * The cap across all of them. Well under the per-image cap times three on
 * purpose: base64 inflates by a third in transit, and anything the endpoint
 * forwards to email has to survive a 25 MB mailbox limit.
 */
export const ATTACHMENTS_TOTAL_MAX_BYTES = 12 * 1024 * 1024

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
export function parsePastedImage(
  value: unknown,
  maxBytes: number = ATTACHMENT_MAX_BYTES,
): PastedImage | null {
  if (typeof value !== 'string') return null

  const match = DATA_URL.exec(value)
  if (!match) return null

  const [, mediaType, payload] = match as unknown as [string, string, string]
  if (!ALLOWED_MEDIA_TYPES.some((allowed) => allowed === mediaType)) return null
  // A payload that is not a whole number of base64 quanta is not base64.
  if (payload.length % 4 !== 0) return null

  const byteLength = decodedLength(payload)
  if (byteLength === 0 || byteLength > maxBytes) return null

  return { dataUrl: value, mediaType, byteLength }
}

/**
 * Validates a complete attachment list at the main-process boundary.
 *
 * Keeping this as a dedicated operation also avoids passing `parsePastedImage`
 * directly to `Array.map`: map's second callback argument is the array index,
 * which would otherwise be mistaken for the parser's optional byte limit.
 */
export function parsePastedImages(values: readonly unknown[]): PastedImage[] | null {
  if (values.length > MAX_ATTACHMENTS) return null

  const images: PastedImage[] = []
  for (const value of values) {
    const image = parsePastedImage(value)
    if (!image) return null
    images.push(image)
  }

  if (totalBytes(images) > ATTACHMENTS_TOTAL_MAX_BYTES) return null
  return images
}

export function totalBytes(images: readonly PastedImage[]): number {
  return images.reduce((sum, image) => sum + image.byteLength, 0)
}

/**
 * Why one more image cannot join the ones already pasted, ready to show, or
 * null when it can. Kept apart from `parsePastedImage` because a perfectly good
 * image can still be the one too many.
 */
export function attachmentProblem(
  existing: readonly PastedImage[],
  next: PastedImage,
): string | null {
  if (existing.length >= MAX_ATTACHMENTS) {
    return `Chop sends at most ${MAX_ATTACHMENTS} images. Remove one first.`
  }
  if (totalBytes(existing) + next.byteLength > ATTACHMENTS_TOTAL_MAX_BYTES) {
    return `That would take the images past ${formatBytes(ATTACHMENTS_TOTAL_MAX_BYTES)} together. Remove one first.`
  }
  return null
}

/**
 * What an image is called once it leaves, since a paste has no name. The index
 * is one-based so the files read the way the thumbnails are ordered.
 */
export function attachmentFileName(mediaType: string, index: number): string {
  return `pasted-image-${index + 1}.${EXTENSIONS[mediaType] ?? 'png'}`
}

/** For the line under the thumbnails, e.g. `1.4 MB`. */
export function formatBytes(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`
  if (byteLength < 1024 * 1024) return `${Math.round(byteLength / 1024)} KB`
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`
}
