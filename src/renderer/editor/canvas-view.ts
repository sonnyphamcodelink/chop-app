import { backingScale, fitScale, viewToImage } from '@shared/canvas-mapping'
import { fullImageRect } from '@shared/crop-session'
import { outputSize } from '@shared/document'
import type { EditorState } from '@shared/editor-state'
import { currentDocument } from '@shared/editor-state'
import type { Point } from '@shared/geometry'
import { handleRects } from '@shared/hit-test'
import { type CanvasFactory, renderDocument } from '@shared/render'
import { documentWithDraft } from '@shared/tools'

export const browserCanvasFactory: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  return { canvas, ctx }
}

export type CanvasView = {
  setImage(image: HTMLImageElement): void
  render(state: EditorState): void
  /** Renders the exported image: no zoom, no selection chrome. */
  renderTo(target: CanvasRenderingContext2D, state: EditorState): void
  toImagePoint(event: MouseEvent, state: EditorState): Point
  scale(): number
}

const SELECTION_COLOR = '#2f9bff'

export function createCanvasView(canvas: HTMLCanvasElement): CanvasView {
  let image: HTMLImageElement | null = null
  /** CSS pixels per image pixel (on-screen size). Hit-testing uses this. */
  let currentScale = 1

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
      const w = handle.rect.width / scale
      const h = handle.rect.height / scale
      const cx = handle.rect.x + handle.rect.width / 2
      const cy = handle.rect.y + handle.rect.height / 2
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h)
    }
    ctx.restore()
  }

  return {
    setImage(next: HTMLImageElement): void {
      image = next
    },

    render(state: EditorState): void {
      if (!image) return
      const inCropSession = state.tool === 'crop' && !!state.cropSession
      const baseDoc = currentDocument(state)
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
      const cropOrigin =
        state.tool === 'crop' && state.cropSession
          ? null
          : currentDocument(state).cropRect
      return viewToImage(local, currentScale, cropOrigin)
    },

    scale(): number {
      return currentScale
    },
  }
}
