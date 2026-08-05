import { fitScale, viewToImage } from '@shared/canvas-mapping'
import { outputSize } from '@shared/document'
import type { EditorState } from '@shared/editor-state'
import { currentDocument } from '@shared/editor-state'
import type { Point } from '@shared/geometry'
import { annotationBounds, handleRects } from '@shared/hit-test'
import { type CanvasFactory, renderDocument } from '@shared/render'
import { cropDraftRect, documentWithDraft } from '@shared/tools'

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
  let currentScale = 1

  function ctx2d(): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    return ctx
  }

  function drawSelection(ctx: CanvasRenderingContext2D, state: EditorState): void {
    if (state.tool !== 'select' || !state.selectedId) return
    const annotation = currentDocument(state).annotations.find(
      (a) => a.id === state.selectedId,
    )
    if (!annotation) return

    const bounds = annotationBounds(annotation)
    ctx.save()
    ctx.strokeStyle = SELECTION_COLOR
    ctx.lineWidth = 1 / currentScale
    ctx.setLineDash([4 / currentScale, 3 / currentScale])
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
    ctx.setLineDash([])
    ctx.fillStyle = SELECTION_COLOR
    for (const handle of handleRects(bounds)) {
      ctx.fillRect(
        handle.rect.x, handle.rect.y,
        handle.rect.width / currentScale, handle.rect.height / currentScale,
      )
    }
    ctx.restore()
  }

  function drawCropDraft(ctx: CanvasRenderingContext2D, state: EditorState): void {
    const rect = cropDraftRect(state.draft)
    if (!rect) return
    ctx.save()
    ctx.strokeStyle = SELECTION_COLOR
    ctx.lineWidth = 1 / currentScale
    ctx.setLineDash([4 / currentScale, 3 / currentScale])
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
    ctx.restore()
  }

  return {
    setImage(next: HTMLImageElement): void {
      image = next
    },

    render(state: EditorState): void {
      if (!image) return
      const doc = documentWithDraft(currentDocument(state), state.draft, state.style)
      const size = outputSize(doc)
      const parent = canvas.parentElement
      currentScale = fitScale(
        size.width, size.height,
        parent?.clientWidth ?? size.width,
        parent?.clientHeight ?? size.height,
      )

      canvas.width = Math.max(1, Math.round(size.width * currentScale))
      canvas.height = Math.max(1, Math.round(size.height * currentScale))
      canvas.style.width = `${canvas.width}px`
      canvas.style.height = `${canvas.height}px`

      const ctx = ctx2d()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(currentScale, currentScale)
      renderDocument(ctx, image, doc, browserCanvasFactory)
      drawSelection(ctx, state)
      drawCropDraft(ctx, state)
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
      return viewToImage(local, currentScale, currentDocument(state).cropRect)
    },

    scale(): number {
      return currentScale
    },
  }
}
