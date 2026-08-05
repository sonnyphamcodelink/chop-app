import { BLUR_SAMPLE_SIZE } from './constants'
import type {
  Annotation,
  ArrowAnnotation,
  BlurAnnotation,
  BoxAnnotation,
  CaptureDocument,
  HighlightAnnotation,
  TextAnnotation,
} from './document'

/** Creates an offscreen drawing surface. Injected so rendering stays testable. */
export type CanvasFactory = (
  width: number,
  height: number,
) => { readonly canvas: CanvasImageSource; readonly ctx: CanvasRenderingContext2D }

const HIGHLIGHT_ALPHA = 0.4
const ARROW_HEAD_RATIO = 4

/** Gaussian softening laid over the downsample, in image pixels. */
const BLUR_SOFTEN_PX = 8
/** Frosted-glass wash, so a redacted region reads as light rather than a dark smear. */
const BLUR_WASH_COLOR = 'rgba(255, 255, 255, 0.65)'

function drawBox(ctx: CanvasRenderingContext2D, box: BoxAnnotation): void {
  ctx.strokeStyle = box.color
  ctx.lineWidth = box.strokeWidth
  ctx.strokeRect(box.rect.x, box.rect.y, box.rect.width, box.rect.height)
}

function drawArrow(ctx: CanvasRenderingContext2D, arrow: ArrowAnnotation): void {
  const headLength = arrow.strokeWidth * ARROW_HEAD_RATIO
  const angle = Math.atan2(arrow.to.y - arrow.from.y, arrow.to.x - arrow.from.x)

  ctx.strokeStyle = arrow.color
  ctx.fillStyle = arrow.color
  ctx.lineWidth = arrow.strokeWidth
  ctx.lineJoin = 'round'

  // Stop the shaft short of the tip so the head has a clean point.
  const shaftEndX = arrow.to.x - Math.cos(angle) * headLength * 0.8
  const shaftEndY = arrow.to.y - Math.sin(angle) * headLength * 0.8

  ctx.beginPath()
  ctx.moveTo(arrow.from.x, arrow.from.y)
  ctx.lineTo(shaftEndX, shaftEndY)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(arrow.to.x, arrow.to.y)
  ctx.lineTo(
    arrow.to.x - Math.cos(angle - Math.PI / 7) * headLength,
    arrow.to.y - Math.sin(angle - Math.PI / 7) * headLength,
  )
  ctx.lineTo(
    arrow.to.x - Math.cos(angle + Math.PI / 7) * headLength,
    arrow.to.y - Math.sin(angle + Math.PI / 7) * headLength,
  )
  ctx.closePath()
  ctx.fill()
}

function drawHighlight(
  ctx: CanvasRenderingContext2D,
  highlight: HighlightAnnotation,
): void {
  ctx.save()
  // Multiply keeps the underlying text legible through the marker.
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = HIGHLIGHT_ALPHA
  ctx.fillStyle = highlight.color
  ctx.fillRect(
    highlight.rect.x,
    highlight.rect.y,
    highlight.rect.width,
    highlight.rect.height,
  )
  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, text: TextAnnotation): void {
  ctx.fillStyle = text.color
  ctx.font = `${text.fontSize}px -apple-system, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillText(text.text, text.at.x, text.at.y)
}

/**
 * Redaction first, looks second. The region is downsampled to a coarse grid,
 * which is what actually destroys the detail — no amount of sharpening brings
 * back text that was never kept. Everything after that is cosmetic: the grid is
 * smoothed back up, softened, and washed with white so the result reads as
 * frosted glass rather than a dark mosaic.
 */
function drawBlur(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  blur: BlurAnnotation,
  createCanvas: CanvasFactory,
): void {
  const { rect } = blur
  const samplesWide = Math.max(1, Math.round(rect.width / BLUR_SAMPLE_SIZE))
  const samplesHigh = Math.max(1, Math.round(rect.height / BLUR_SAMPLE_SIZE))

  const small = createCanvas(samplesWide, samplesHigh)
  small.ctx.imageSmoothingEnabled = true
  small.ctx.drawImage(
    image,
    rect.x, rect.y, rect.width, rect.height,
    0, 0, samplesWide, samplesHigh,
  )

  ctx.save()
  // Clip to the region, then paint past it: a gaussian drawn flush to the edge
  // samples the transparency outside and would leave the original showing
  // through a feathered border.
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.width, rect.height)
  ctx.clip()
  ctx.imageSmoothingEnabled = true
  ctx.filter = `blur(${BLUR_SOFTEN_PX}px)`
  const bleed = BLUR_SOFTEN_PX * 2
  ctx.drawImage(
    small.canvas,
    0, 0, samplesWide, samplesHigh,
    rect.x - bleed, rect.y - bleed, rect.width + bleed * 2, rect.height + bleed * 2,
  )
  ctx.filter = 'none'
  ctx.fillStyle = BLUR_WASH_COLOR
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  ctx.restore()
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  annotation: Annotation,
  createCanvas: CanvasFactory,
): void {
  switch (annotation.kind) {
    case 'box':
      return drawBox(ctx, annotation)
    case 'arrow':
      return drawArrow(ctx, annotation)
    case 'highlight':
      return drawHighlight(ctx, annotation)
    case 'text':
      return drawText(ctx, annotation)
    case 'blur':
      return drawBlur(ctx, image, annotation, createCanvas)
  }
}

/**
 * Renders a document to a context sized to `outputSize(doc)`. Annotations are in
 * image coordinates, so a crop is applied as a translation rather than by
 * rewriting any annotation.
 */
export function renderDocument(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  doc: CaptureDocument,
  createCanvas: CanvasFactory,
): void {
  ctx.save()
  if (doc.cropRect) ctx.translate(-doc.cropRect.x, -doc.cropRect.y)

  ctx.drawImage(image, 0, 0, doc.width, doc.height)
  for (const annotation of doc.annotations) {
    drawAnnotation(ctx, image, annotation, createCanvas)
  }

  ctx.restore()
}
