import { calloutBadgeRect, hideCalloutText } from '@shared/callout'
import { backingScale, fitScale, imageToView, viewToImage } from '@shared/canvas-mapping'
import { cropBounds } from '@shared/crop-session'
import { type CaptureDocument, outputSize } from '@shared/document'
import type { EditorState } from '@shared/editor-state'
import { currentDocument } from '@shared/editor-state'
import type { Point, Rect } from '@shared/geometry'
import {
  annotationHandleRects,
  handleRects,
  isEditableAnnotation,
} from '@shared/hit-test'
import { annotationFont, type CanvasFactory, renderDocument } from '@shared/render'
import { documentWithDraft } from '@shared/tools'

export const browserCanvasFactory: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  return { canvas, ctx }
}

/** One scratch context, reused: measuring must not allocate a canvas per call. */
let measuringContext: CanvasRenderingContext2D | null = null

/** Measures annotation text at `fontSize`, in image pixels. */
export function textMeasurer(fontSize: number): (text: string) => number {
  measuringContext ??= browserCanvasFactory(1, 1).ctx
  const ctx = measuringContext
  ctx.font = annotationFont(fontSize)
  return (text) => ctx.measureText(text).width
}

export type CanvasView = {
  setImage(image: HTMLImageElement): void
  /** Sets the user-selected multiplier on top of the fit-to-window scale. */
  setZoom(zoom: number): void
  render(state: EditorState): void
  /** Renders the exported image: no zoom, no selection chrome. */
  renderTo(target: CanvasRenderingContext2D, state: EditorState): void
  toImagePoint(event: MouseEvent, state: EditorState): Point
  /** Image coordinates to canvas-local CSS pixels, for positioning overlays. */
  toCanvasPoint(point: Point, state: EditorState): Point
  scale(): number
  zoom(): number
}

const SELECTION_COLOR = '#2f9bff'
/** Dark chip behind the callout delete cross, so it reads on any bubble colour. */
const BADGE_COLOR = 'rgba(0, 0, 0, 0.7)'
/** Resize handles stay subtle and the same size on screen at every zoom level. */
const RESIZE_HANDLE_RADIUS = 3.5

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function resizeHandleRadius(scale: number): number {
  return RESIZE_HANDLE_RADIUS / (scale > 0 ? scale : 1)
}

/** Draws editor-only resize chrome: white fill, thin black outline, 7 CSS px. */
export function drawResizeHandle(
  ctx: CanvasRenderingContext2D,
  center: Point,
  scale: number,
): void {
  const safeScale = scale > 0 ? scale : 1
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = 1 / safeScale
  ctx.beginPath()
  ctx.arc(center.x, center.y, resizeHandleRadius(safeScale), 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
}

export function createCanvasView(canvas: HTMLCanvasElement): CanvasView {
  let image: HTMLImageElement | null = null
  /** CSS pixels per image pixel (on-screen size). Hit-testing uses this. */
  let currentScale = 1
  /** User zoom is relative to the fitted size, where 1 is the default 100%. */
  let currentZoom = 1

  /** Reframing draws the whole image, so it has no crop offset. Trimming keeps it. */
  function cropOrigin(state: EditorState): Rect | null {
    if (state.cropSession?.mode === 'reframe') return null
    return currentDocument(state).cropRect
  }

  function ctx2d(): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    return ctx
  }

  /**
   * The eight grab points of a crop frame, nudged inward where the frame sits on
   * the edge of `bounds` so the complete circle and its border show.
   */
  function drawFrameHandles(
    ctx: CanvasRenderingContext2D,
    rect: Rect,
    bounds: Rect,
    scale: number,
  ): void {
    const outerRadius = resizeHandleRadius(scale) + 0.5 / scale
    for (const handle of handleRects(rect)) {
      const cx = clamp(
        handle.rect.x + handle.rect.width / 2,
        bounds.x + outerRadius,
        bounds.x + bounds.width - outerRadius,
      )
      const cy = clamp(
        handle.rect.y + handle.rect.height / 2,
        bounds.y + outerRadius,
        bounds.y + bounds.height - outerRadius,
      )
      drawResizeHandle(ctx, { x: cx, y: cy }, scale)
    }
  }

  /**
   * The trim affordance every non-Crop tool carries: the handles alone, on the
   * edges of the view, with nothing dimmed until one of them is dragged.
   */
  function drawTrimAffordance(
    ctx: CanvasRenderingContext2D,
    state: EditorState,
    scale: number,
  ): void {
    if (state.tool === 'crop' || state.cropSession) return
    const rect = cropBounds(currentDocument(state), 'trim')
    ctx.save()
    ctx.translate(-rect.x, -rect.y)
    drawFrameHandles(ctx, rect, rect, scale)
    ctx.restore()
  }

  function drawCropSession(ctx: CanvasRenderingContext2D, state: EditorState, scale: number): void {
    const session = state.cropSession
    if (!session) return
    const doc = currentDocument(state)
    const bounds = cropBounds(doc, session.mode)
    const { rect } = session

    ctx.save()
    // A trim frame is drawn over the cropped view, which starts at the crop origin.
    if (session.mode === 'trim') ctx.translate(-bounds.x, -bounds.y)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fillRect(bounds.x, bounds.y, bounds.width, Math.max(0, rect.y - bounds.y))
    ctx.fillRect(
      bounds.x,
      rect.y + rect.height,
      bounds.width,
      Math.max(0, bounds.y + bounds.height - (rect.y + rect.height)),
    )
    ctx.fillRect(bounds.x, rect.y, Math.max(0, rect.x - bounds.x), rect.height)
    ctx.fillRect(
      rect.x + rect.width,
      rect.y,
      Math.max(0, bounds.x + bounds.width - (rect.x + rect.width)),
      rect.height,
    )

    ctx.strokeStyle = SELECTION_COLOR
    ctx.lineWidth = 1 / scale
    ctx.setLineDash([4 / scale, 3 / scale])
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
    ctx.setLineDash([])
    drawFrameHandles(ctx, rect, bounds, scale)
    ctx.restore()
  }

  /**
   * Editor chrome for the annotation under the pointer, the one selected, or
   * the callout being typed into. Never drawn by `renderTo`, so it stays out of
   * the export.
   */
  function drawAnnotationChrome(
    ctx: CanvasRenderingContext2D,
    state: EditorState,
    doc: CaptureDocument,
    scale: number,
  ): void {
    const id = state.editingCalloutId ?? state.selectedAnnotationId ?? state.hoveredAnnotationId
    if (!id) return
    const annotation = doc.annotations.find((a) => a.id === id)
    if (!annotation) return

    ctx.save()
    if (doc.cropRect) ctx.translate(-doc.cropRect.x, -doc.cropRect.y)

    if (annotation.kind === 'callout') {
      // The same handles as the crop frame. The tail has none: it follows the
      // bubble rather than being aimed.
      for (const handle of handleRects(annotation.rect)) {
        drawResizeHandle(
          ctx,
          {
            x: handle.rect.x + handle.rect.width / 2,
            y: handle.rect.y + handle.rect.height / 2,
          },
          scale,
        )
      }

      const badge = calloutBadgeRect(annotation.rect, scale)
      const radius = badge.width / 2
      const centre = { x: badge.x + radius, y: badge.y + radius }

      ctx.fillStyle = BADGE_COLOR
      ctx.beginPath()
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2)
      ctx.fill()

      // A cross, drawn rather than typed, so it does not depend on a font.
      const arm = radius * 0.42
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = Math.max(1 / scale, radius * 0.18)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(centre.x - arm, centre.y - arm)
      ctx.lineTo(centre.x + arm, centre.y + arm)
      ctx.moveTo(centre.x + arm, centre.y - arm)
      ctx.lineTo(centre.x - arm, centre.y + arm)
      ctx.stroke()
    } else if (isEditableAnnotation(annotation)) {
      for (const handle of annotationHandleRects(annotation)) {
        drawResizeHandle(
          ctx,
          {
            x: handle.rect.x + handle.rect.width / 2,
            y: handle.rect.y + handle.rect.height / 2,
          },
          scale,
        )
      }
    }

    ctx.restore()
  }

  return {
    setImage(next: HTMLImageElement): void {
      image = next
    },

    setZoom(zoom: number): void {
      currentZoom = zoom > 0 ? zoom : 1
    },

    render(state: EditorState): void {
      if (!image) return
      const reframing = state.cropSession?.mode === 'reframe'
      const baseDoc = state.editingCalloutId
        ? hideCalloutText(currentDocument(state), state.editingCalloutId)
        : currentDocument(state)
      const doc = reframing
        ? { ...baseDoc, cropRect: null }
        : documentWithDraft(baseDoc, state.draft, state.style)
      const size = outputSize(doc)
      const parent = canvas.parentElement
      const fittedScale = fitScale(
        size.width, size.height,
        parent?.clientWidth ?? size.width,
        parent?.clientHeight ?? size.height,
        doc.scaleFactor,
      )
      currentScale = fittedScale * currentZoom
      const bufferScale = backingScale(currentScale, window.devicePixelRatio)

      const cssWidth = Math.max(1, Math.round(size.width * currentScale))
      const cssHeight = Math.max(1, Math.round(size.height * currentScale))
      canvas.style.width = `${cssWidth}px`
      canvas.style.height = `${cssHeight}px`
      // Full-resolution backing store so DIP-sized CSS is not soft on Retina.
      canvas.width = Math.max(1, Math.round(size.width * bufferScale))
      canvas.height = Math.max(1, Math.round(size.height * bufferScale))

      const ctx = ctx2d()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      // Only matters when the capture is too big for the viewport and has to be
      // shrunk to fit: the default filter mangles text, this one keeps it legible.
      ctx.imageSmoothingQuality = 'high'
      ctx.scale(bufferScale, bufferScale)
      renderDocument(ctx, image, doc, browserCanvasFactory)
      drawTrimAffordance(ctx, state, currentScale)
      drawCropSession(ctx, state, currentScale)
      if (!reframing) drawAnnotationChrome(ctx, state, doc, currentScale)
      ctx.restore()
    },

    renderTo(target: CanvasRenderingContext2D, state: EditorState): void {
      if (!image) return
      // No scale and no selection chrome: this is the exported image.
      renderDocument(target, image, currentDocument(state), browserCanvasFactory)
    },

    toImagePoint(event: MouseEvent, state: EditorState): Point {
      const rect = canvas.getBoundingClientRect()
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      return viewToImage(local, currentScale, cropOrigin(state))
    },

    toCanvasPoint(point: Point, state: EditorState): Point {
      return imageToView(point, currentScale, cropOrigin(state))
    },

    scale(): number {
      return currentScale
    },

    zoom(): number {
      return currentZoom
    },
  }
}
