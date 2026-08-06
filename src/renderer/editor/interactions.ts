import { CALLOUT_DRAG_THRESHOLD } from '@shared/constants'
import { constrainCropRect, fullImageRect, moveCropRect } from '@shared/crop-session'
import { canvasCursor, RETICLE_CURSOR } from '@shared/cursor'
import {
  addAnnotation,
  type CalloutAnnotation,
  type CaptureDocument,
  updateAnnotation,
} from '@shared/document'
import {
  commitDocument,
  commitPreview,
  currentDocument,
  type EditorState,
  previewDocument,
  setCropSession,
  setDraft,
  setHoveredAnnotation,
} from '@shared/editor-state'
import { type Point, rectContains } from '@shared/geometry'
import {
  type AnnotationHandleId,
  calloutHitAtPoint,
  type EditableAnnotation,
  editableHitAtPoint,
  type HandleId,
  handleAtPoint,
  moveAnnotation,
  resizeAnnotation,
  resizeRect,
} from '@shared/hit-test'
import {
  beginDraft,
  calloutRect,
  createCallout,
  draftToAnnotation,
  isDrawingTool,
  updateDraft,
} from '@shared/tools'
import type { CanvasView } from './canvas-view'

export type Store = {
  get(): EditorState
  set(state: EditorState): void
}

/** Interactions the canvas cannot finish on its own. */
export type InteractionHandlers = {
  /** Any press on the canvas, before it is acted on: a note being typed elsewhere ends here. */
  onCanvasPress(): void
  /** The Text tool was clicked at `imagePoint`. */
  onTextPoint(event: MouseEvent, imagePoint: Point): void
  /** A callout was clicked, to write or rewrite its note. */
  onCalloutEdit(callout: CalloutAnnotation): void
  /** A callout's delete badge was clicked. */
  onCalloutDelete(callout: CalloutAnnotation): void
}

type Gesture =
  | { readonly mode: 'draw' }
  | { readonly mode: 'crop-resize'; readonly handle: HandleId }
  | { readonly mode: 'crop-move'; readonly last: Point }
  | {
      readonly mode: 'callout-move'
      readonly callout: CalloutAnnotation
      /** The document before the drag, so undo steps over the whole move. */
      readonly origin: CaptureDocument
      readonly last: Point
      /** Until the pointer travels far enough, this is still a click. */
      readonly moved: boolean
    }
  | {
      readonly mode: 'annotation-move'
      readonly annotation: EditableAnnotation
      readonly origin: CaptureDocument
      readonly last: Point
    }
  | {
      readonly mode: 'annotation-resize'
      readonly annotation: EditableAnnotation
      readonly handle: AnnotationHandleId
      readonly origin: CaptureDocument
    }

function newId(): string {
  return crypto.randomUUID()
}

export function attachInteractions(
  canvas: HTMLCanvasElement,
  view: CanvasView,
  store: Store,
  handlers: InteractionHandlers,
): void {
  let gesture: Gesture | null = null

  /** Callouts and placed shapes are inert while a crop frame is being set. */
  function shapesInteractive(state: EditorState): boolean {
    return !(state.tool === 'crop' && state.cropSession)
  }

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    // Committing first, because the press below may suppress the overlay's blur.
    handlers.onCanvasPress()
    const state = store.get()
    const point = view.toImagePoint(event, state)

    if (shapesInteractive(state)) {
      // Callouts answer first: badge deletes, bubble moves or opens for typing.
      const calloutHit = calloutHitAtPoint(currentDocument(state), point, view.scale())
      if (calloutHit?.part === 'badge') {
        event.preventDefault()
        handlers.onCalloutDelete(calloutHit.callout)
        return
      }
      if (calloutHit) {
        event.preventDefault()
        canvas.style.cursor = canvasCursor({ kind: 'move' })
        gesture = {
          mode: 'callout-move',
          callout: calloutHit.callout,
          origin: currentDocument(state),
          last: point,
          moved: false,
        }
        return
      }

      // Boxes, arrows, and text: grab in any tool, same as callouts.
      const editHit = editableHitAtPoint(currentDocument(state), point, view.scale())
      if (editHit) {
        event.preventDefault()
        const origin = currentDocument(state)
        canvas.style.cursor = canvasCursor(
          editHit.handle
            ? { kind: 'resize', cursor: cursorForHandle(editHit.handle) }
            : { kind: 'move' },
        )
        gesture = editHit.handle
          ? {
              mode: 'annotation-resize',
              annotation: editHit.annotation,
              handle: editHit.handle,
              origin,
            }
          : {
              mode: 'annotation-move',
              annotation: editHit.annotation,
              origin,
              last: point,
            }
        return
      }
    }

    if (state.tool === 'text') {
      // The default mousedown focus change would blur the field straight away.
      event.preventDefault()
      handlers.onTextPoint(event, point)
      return
    }
    if (state.tool === 'crop' && state.cropSession) {
      const { rect } = state.cropSession
      const handle = handleAtPoint(rect, point, view.scale())
      if (handle) {
        canvas.style.cursor = canvasCursor({ kind: 'resize', cursor: cursorForHandle(handle) })
        gesture = { mode: 'crop-resize', handle }
      } else if (rectContains(rect, point)) {
        canvas.style.cursor = canvasCursor({ kind: 'move' })
        gesture = { mode: 'crop-move', last: point }
      }
      return
    }
    if (isDrawingTool(state.tool)) {
      gesture = { mode: 'draw' }
      canvas.style.cursor = RETICLE_CURSOR
      store.set(setDraft(state, beginDraft(state.tool, point)))
    }
  })

  canvas.addEventListener('mousemove', (event) => {
    const state = store.get()
    const point = view.toImagePoint(event, state)

    if (!gesture) {
      updateHover(state, point)
      return
    }

    if (gesture.mode === 'draw') {
      canvas.style.cursor = RETICLE_CURSOR
      if (state.draft) store.set(setDraft(state, updateDraft(state.draft, point)))
      return
    }

    if (gesture.mode === 'callout-move') {
      const dx = point.x - gesture.last.x
      const dy = point.y - gesture.last.y
      const moved =
        gesture.moved || Math.hypot(dx, dy) * view.scale() > CALLOUT_DRAG_THRESHOLD
      if (!moved) return
      store.set(
        previewDocument(
          state,
          updateAnnotation(currentDocument(state), gesture.callout.id, (annotation) =>
            moveAnnotation(annotation, dx, dy),
          ),
        ),
      )
      gesture = { ...gesture, last: point, moved: true }
      return
    }

    if (gesture.mode === 'annotation-move') {
      const dx = point.x - gesture.last.x
      const dy = point.y - gesture.last.y
      store.set(
        previewDocument(
          state,
          updateAnnotation(currentDocument(state), gesture.annotation.id, (annotation) =>
            moveAnnotation(annotation, dx, dy),
          ),
        ),
      )
      gesture = { ...gesture, last: point }
      return
    }

    if (gesture.mode === 'annotation-resize') {
      const { annotation: target, handle } = gesture
      store.set(
        previewDocument(
          state,
          updateAnnotation(currentDocument(state), target.id, (annotation) => {
            if (
              annotation.kind !== 'box' &&
              annotation.kind !== 'arrow' &&
              annotation.kind !== 'text'
            ) {
              return annotation
            }
            return resizeAnnotation(annotation, handle, point)
          }),
        ),
      )
      return
    }

    if (!state.cropSession) return
    const bounds = fullImageRect(currentDocument(state))

    if (gesture.mode === 'crop-resize') {
      const resized = resizeRect(state.cropSession.rect, gesture.handle, point)
      store.set(setCropSession(state, constrainCropRect(resized, bounds)))
      return
    }

    if (gesture.mode === 'crop-move') {
      const dx = point.x - gesture.last.x
      const dy = point.y - gesture.last.y
      store.set(setCropSession(state, moveCropRect(state.cropSession.rect, dx, dy, bounds)))
      gesture = { ...gesture, last: point }
    }
  })

  /** Shows handles / the delete badge, and the cursor, for whatever is under the pointer. */
  function updateHover(state: EditorState, point: Point): void {
    if (state.tool === 'crop' && state.cropSession) {
      const { rect } = state.cropSession
      const handle = handleAtPoint(rect, point, view.scale())
      canvas.style.cursor = canvasCursor(
        handle
          ? { kind: 'resize', cursor: cursorForHandle(handle) }
          : rectContains(rect, point)
            ? { kind: 'move' }
            : { kind: 'none' },
      )
      store.set(setHoveredAnnotation(state, null))
      return
    }

    if (!shapesInteractive(state)) {
      canvas.style.cursor = canvasCursor({ kind: 'none' })
      store.set(setHoveredAnnotation(state, null))
      return
    }

    const calloutHit = calloutHitAtPoint(currentDocument(state), point, view.scale())
    if (calloutHit) {
      canvas.style.cursor = canvasCursor(
        calloutHit.part === 'badge' ? { kind: 'pointer' } : { kind: 'move' },
      )
      store.set(setHoveredAnnotation(state, calloutHit.callout.id))
      return
    }

    const editHit = editableHitAtPoint(currentDocument(state), point, view.scale())
    if (editHit) {
      canvas.style.cursor = canvasCursor(
        editHit.handle
          ? { kind: 'resize', cursor: cursorForHandle(editHit.handle) }
          : { kind: 'move' },
      )
      store.set(setHoveredAnnotation(state, editHit.annotation.id))
      return
    }

    canvas.style.cursor = canvasCursor({ kind: 'none' })
    store.set(setHoveredAnnotation(state, null))
  }

  canvas.addEventListener('mouseup', () => {
    if (!gesture) return
    const state = store.get()
    const finished = gesture
    gesture = null

    if (finished.mode === 'callout-move') {
      // A bubble that never really moved was a click, so it opens for typing.
      if (finished.moved) store.set(commitPreview(state, finished.origin))
      else handlers.onCalloutEdit(finished.callout)
      return
    }

    if (finished.mode === 'annotation-move' || finished.mode === 'annotation-resize') {
      store.set(commitPreview(state, finished.origin))
      return
    }

    // A crop gesture only adjusts the working frame; Enter commits it.
    if (finished.mode !== 'draw') return

    if (state.draft) {
      // A callout lands empty; its note is typed by clicking the bubble after.
      if (state.draft.tool === 'callout') {
        const rect = calloutRect(state.draft, state.style)
        store.set(
          commitDocument(
            state,
            addAnnotation(currentDocument(state), createCallout(rect, '', state.style, newId())),
          ),
        )
        return
      }

      const annotation = draftToAnnotation(state.draft, state.style, newId())
      store.set(
        annotation
          ? commitDocument(state, addAnnotation(currentDocument(state), annotation))
          : setDraft(state, null),
      )
      return
    }

    store.set(setDraft(state, null))
  })

  canvas.addEventListener('mouseleave', () => {
    store.set(setHoveredAnnotation(store.get(), null))
    canvas.style.cursor = canvasCursor({ kind: 'none' })
    if (!gesture) return
    const abandoned = gesture
    gesture = null

    // Leaving mid-move keeps the shape where it got to, as one history entry.
    if (
      abandoned.mode === 'callout-move' ||
      abandoned.mode === 'annotation-move' ||
      abandoned.mode === 'annotation-resize'
    ) {
      if (abandoned.mode === 'callout-move' && !abandoned.moved) return
      store.set(commitPreview(store.get(), abandoned.origin))
      return
    }
    // Leaving the canvas ends the drag but keeps the frame the user dragged out.
    if (abandoned.mode !== 'draw') return
    store.set(setDraft(store.get(), null))
  })

  canvas.style.cursor = RETICLE_CURSOR
}

function cursorForHandle(handle: AnnotationHandleId): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize'
    case 'e':
    case 'w':
      return 'ew-resize'
    case 'nw':
    case 'se':
      return 'nwse-resize'
    case 'ne':
    case 'sw':
      return 'nesw-resize'
    case 'from':
    case 'to':
      return 'pointer'
  }
}
