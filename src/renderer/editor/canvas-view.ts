import { calloutBadgeRect, hideCalloutText } from '@shared/callout'
import { backingScale, fitScale, imageToView, viewToImage } from '@shared/canvas-mapping'
import { fullImageRect } from '@shared/crop-session'
import { type CaptureDocument, outputSize } from '@shared/document'
import type { EditorState } from '@shared/editor-state'
import { currentDocument } from '@shared/editor-state'
import type { Point, Rect } from '@shared/geometry'
import { handleRects } from '@shared/hit-test'
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
  render(state: EditorState): void
  /** Renders the exported image: no zoom, no selection chrome. */
  renderTo(target: CanvasRenderingContext2D, state: EditorState): void
  toImagePoint(event: MouseEvent, state: EditorState): Point
  /** Image coordinates to canvas-local CSS pixels, for positioning overlays. */
  toCanvasPoint(point: Point, state: EditorState): Point
  scale(): number
}

const SELECTION_COLOR = '#2f9bff'
/** Dark chip behind the callout delete cross, so it reads on any bubble colour. */
const BADGE_COLOR = 'rgba(0, 0, 0, 0.7)'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function createCanvasView(canvas: HTMLCanvasElement): CanvasView {
  let image: HTMLImageElement | null = null
  /** CSS pixels per image pixel (on-screen size). Hit-testing uses this. */
  let currentScale = 1

  /** A live crop session draws the whole image, so it has no crop offset. */
  function cropOrigin(state: EditorState): Rect | null {
    if (state.tool === 'crop' && state.cropSession) return null
    return currentDocument(state).cropRect
  }

  function ctx2d(): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    return ctx
  }

  function drawCropSession(ctx: CanvasRenderingContext2D, state: EditorState, scale: number): void {
    const session = state.cropSession
    if (state.tool !== 'crop' || !session) return
    const doc = currentDocument(state)
    const bounds = fullImageRect(doc)
    const { rect } = session

    ctx.save()
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
    ctx.fillStyle = SELECTION_COLOR
    for (const handle of handleRects(rect)) {
      // Handles keep a constant on-screen size, and are nudged off the image
      // edge so a frame at the boundary still shows a whole, grabbable square.
      const w = handle.rect.width / scale
      const h = handle.rect.height / scale
      const cx = clamp(
        handle.rect.x + handle.rect.width / 2,
        bounds.x + w / 2,
        bounds.x + bounds.width - w / 2,
      )
      const cy = clamp(
        handle.rect.y + handle.rect.height / 2,
        bounds.y + h / 2,
        bounds.y + bounds.height - h / 2,
      )
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h)
    }
    ctx.restore()
  }

  /**
   * The delete badge on the callout under the pointer (or the one being typed
   * into). Chrome, not content: `renderTo` never draws it, so it stays out of
   * the exported image.
   */
  function drawCalloutChrome(
    ctx: CanvasRenderingContext2D,
    state: EditorState,
    doc: CaptureDocument,
    scale: number,
  ): void {
    const id = state.editingCalloutId ?? state.hoveredCalloutId
    if (!id) return
    const callout = doc.annotations.find((a) => a.id === id && a.kind === 'callout')
    if (!callout || callout.kind !== 'callout') return

    const badge = calloutBadgeRect(callout.rect, scale)
    const radius = badge.width / 2
    const centre = { x: badge.x + radius, y: badge.y + radius }

    ctx.save()
    // Chrome is drawn in image coordinates, so it needs the crop shift too.
    if (doc.cropRect) ctx.translate(-doc.cropRect.x, -doc.cropRect.y)
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
    ctx.restore()
  }

  return {
    setImage(next: HTMLImageElement): void {
      image = next
    },

    render(state: EditorState): void {
      if (!image) return
      const inCropSession = state.tool === 'crop' && !!state.cropSession
      const baseDoc = state.editingCalloutId
        ? hideCalloutText(currentDocument(state), state.editingCalloutId)
        : currentDocument(state)
      const doc = inCropSession
        ? { ...baseDoc, cropRect: null }
        : documentWithDraft(baseDoc, state.draft, state.style)
      const size = outputSize(doc)
      const parent = canvas.parentElement
      currentScale = fitScale(
        size.width, size.height,
        parent?.clientWidth ?? size.width,
        parent?.clientHeight ?? size.height,
        doc.scaleFactor,
      )
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
      ctx.scale(bufferScale, bufferScale)
      renderDocument(ctx, image, doc, browserCanvasFactory)
      drawCropSession(ctx, state, currentScale)
      if (!inCropSession) drawCalloutChrome(ctx, state, doc, currentScale)
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
  }
}
