/**
 * Shrinking a pasted image before it is sent. Lives in the renderer because it
 * needs a canvas, and because doing it here means the reduced version is what
 * crosses IPC rather than the original.
 *
 * Worth being clear about what this is for. It cuts what gets stored and how
 * long an upload takes; it is not a defence for the endpoint, which anyone can
 * post to directly without going near this code.
 */
import { parsePastedImage, RAW_PASTE_MAX_BYTES, type PastedImage } from '@shared/feedback/attachment'
import { downscaleSize, downscaleSteps, type Size } from '@shared/feedback/downscale'

/**
 * WebP carries both the flat colour of UI chrome and the detail of a photo far
 * more cheaply than the PNG a screenshot arrives as, and unlike JPEG it keeps
 * an alpha channel, which a window capture with rounded corners has.
 */
const ENCODE_TYPE = 'image/webp'

/**
 * High enough that small text stays sharp. Most of the saving comes from
 * leaving PNG at all, so there is little to gain by pushing this lower.
 */
const ENCODE_QUALITY = 0.9

function loadImage(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => resolve(null)
    element.src = dataUrl
  })
}

/** Draws through each size in turn, so no single step reduces by more than half. */
function drawThrough(source: HTMLImageElement, path: readonly Size[]): HTMLCanvasElement | null {
  let surface: HTMLCanvasElement | null = null
  let previous: CanvasImageSource = source

  for (const size of path) {
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height

    const context = canvas.getContext('2d')
    if (!context) return null
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(previous, 0, 0, size.width, size.height)

    surface = canvas
    previous = canvas
  }

  return surface
}

/**
 * A smaller version of the same image, or the original when nothing was gained.
 * Never throws: a paste that cannot be re-encoded is still a paste the user
 * meant to attach, and the size caps will catch it if it is too big.
 */
export async function compressPastedImage(image: PastedImage): Promise<PastedImage> {
  // Re-encoding a GIF through a canvas keeps the first frame and silently drops
  // the animation, which is usually the whole reason someone attached one.
  if (image.mediaType === 'image/gif') return image

  const source = await loadImage(image.dataUrl)
  if (!source || source.naturalWidth === 0) return image

  const from = { width: source.naturalWidth, height: source.naturalHeight }
  const to = downscaleSize(from.width, from.height)
  const steps = downscaleSteps(from, to)

  // No reduction called for still means one draw, because the re-encode alone
  // is usually where the saving is.
  const canvas = drawThrough(source, steps.length > 0 ? steps : [to])
  if (!canvas) return image

  const encoded = canvas.toDataURL(ENCODE_TYPE, ENCODE_QUALITY)
  // A browser without WebP encoding quietly hands back a PNG data URL instead.
  if (!encoded.startsWith(`data:${ENCODE_TYPE};base64,`)) return image

  const reduced = parsePastedImage(encoded, RAW_PASTE_MAX_BYTES)
  if (!reduced || reduced.byteLength >= image.byteLength) return image
  return reduced
}
