import { refitCallout } from '@shared/callout'
import { CALLOUT_DRAG_THRESHOLD } from '@shared/constants'
import { constrainCropRect, cropBounds, moveCropRect } from '@shared/crop-session'
import { canvasCursor, type CursorHit, RETICLE_CURSOR } from '@shared/cursor'
import {
  addAnnotation,
  type CalloutAnnotation,
  type CaptureDocument,
  outputSize,
  updateAnnotation,
} from '@shared/document'
import {
  beginTrim,
  commitCrop,
  commitDocument,
  commitPreview,
  currentDocument,
  type EditorState,
  previewDocument,
  setCropRect,
  setDraft,
  setHoveredAnnotation,
  setSelectedAnnotation,
} from '@shared/editor-state'
import { type Point, rectContains } from '@shared/geometry'
import {
  type AnnotationHandleId,
  boxEdgeHitAtPoint,
  type CalloutHit,
  calloutHitAtPoint,
  type EditableAnnotation,
  editableHitAtPoint,
  type HandleId,
  handleAtPoint,
  moveAnnotation,
  resizeAnnotation,
  resizeRect,
} from '@shared/hit-test'
import { beginDraft, draftToAnnotation, isDrawingTool, updateDraft } from '@shared/tools'
import { type CanvasView, textMeasurer } from './canvas-view'

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
}

type Gesture =
  | {
      readonly mode: 'draw'
      /** Shape under the press that drawing started over, for click-to-select. */
      readonly pressEditable?: EditableAnnotation
      readonly pressCallout?: CalloutAnnotation
    }
  | { readonly mode: 'crop-resize'; readonly handle: HandleId }
  | { readonly mode: 'crop-move'; readonly last: Point }
  /** The same frame drag outside the Crop tool, applied when the mouse comes up. */
  | { readonly mode: 'crop-trim'; readonly handle: HandleId }
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
      readonly mode: 'callout-resize'
      readonly callout: CalloutAnnotation
      readonly handle: HandleId
      readonly origin: CaptureDocument
    }
  | {
      readonly mode: 'callout-tail'
      readonly callout: CalloutAnnotation
      readonly origin: CaptureDocument
      readonly start: Point
      readonly moved: boolean
    }
  | {
      readonly mode: 'annotation-move'
      readonly annotation: EditableAnnotation
      readonly origin: CaptureDocument
      readonly last: Point
      /** Until the pointer travels far enough, this is still a click. */
      readonly moved: boolean
    }
  | {
      readonly mode: 'annotation-resize'
      readonly annotation: EditableAnnotation
      readonly handle: AnnotationHandleId
      readonly origin: CaptureDocument
      readonly last: Point
      /** Until the pointer travels far enough, this is still a click. */
      readonly moved: boolean
    }

function newId(): string {
  return crypto.randomUUID()
}

/** The pointer a callout's parts ask for: re-aim, resize, move. */
function calloutCursor(hit: CalloutHit): CursorHit {
  switch (hit.part) {
    case 'tail':
      return { kind: 'pointer' }
    case 'handle':
      return { kind: 'resize', cursor: cursorForHandle(hit.handle) }
    case 'body':
      return { kind: 'move' }
  }
}

export function attachInteractions(
  canvas: HTMLCanvasElement,
  view: CanvasView,
  store: Store,
  handlers: InteractionHandlers,
): void {
  let gesture: Gesture | null = null

  /** Callouts and placed shapes are inert while the Crop tool's frame is being set. */
  function shapesInteractive(state: EditorState): boolean {
    return state.cropSession?.mode !== 'reframe'
  }

  /**
   * The trim handle under the pointer. Every tool but Crop carries these on the
   * edges of the view, so a capture can be cut down without leaving the tool.
   */
  function trimHandleAt(state: EditorState, point: Point): HandleId | null {
    if (state.tool === 'crop' || state.cropSession) return null
    const rect = cropBounds(currentDocument(state), 'trim')
    return handleAtPoint(rect, point, view.scale())
  }

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    // Committing first, because the press below may suppress the overlay's blur.
    handlers.onCanvasPress()
    const state = store.get()
    const point = view.toImagePoint(event, state)

    if (shapesInteractive(state)) {
      // Callouts answer first: the yellow tip re-aims, handles resize, and the
      // bubble moves or opens for typing.
      const calloutHit = calloutHitAtPoint(currentDocument(state), point, view.scale())
      const editHit = editableHitAtPoint(currentDocument(state), point, view.scale())
      const drawing = isDrawingTool(state.tool)
      const textTool = state.tool === 'text'

      // Handles always win, so an unselected shape can still be resized and a
      // callout tip re-aimed without selecting first.
      if (calloutHit?.part === 'tail') {
        event.preventDefault()
        const origin = currentDocument(state)
        store.set(setSelectedAnnotation(state, calloutHit.callout.id))
        canvas.style.cursor = canvasCursor({ kind: 'pointer' })
        gesture = {
          mode: 'callout-tail',
          callout: calloutHit.callout,
          origin,
          start: point,
          moved: false,
        }
        return
      }
      if (calloutHit?.part === 'handle') {
        event.preventDefault()
        const origin = currentDocument(state)
        store.set(setSelectedAnnotation(state, calloutHit.callout.id))
        canvas.style.cursor = canvasCursor({
          kind: 'resize',
          cursor: cursorForHandle(calloutHit.handle),
        })
        gesture = {
          mode: 'callout-resize',
          callout: calloutHit.callout,
          handle: calloutHit.handle,
          origin,
        }
        return
      }
      if (editHit?.handle) {
        event.preventDefault()
        const origin = currentDocument(state)
        store.set(setSelectedAnnotation(state, editHit.annotation.id))
        canvas.style.cursor = canvasCursor({
          kind: 'resize',
          cursor: cursorForHandle(editHit.handle),
        })
        gesture = {
          mode: 'annotation-resize',
          annotation: editHit.annotation,
          handle: editHit.handle,
          origin,
          last: point,
          moved: false,
        }
        return
      }

      const calloutBody = calloutHit?.part === 'body' ? calloutHit.callout : null
      const editableBody = !calloutHit && editHit ? editHit.annotation : null

      // Touching a box edge grabs it for moving — hand cursor, no
      // pre-select needed — while an interior drag still draws (nesting).
      // Handles were already handled above, so they keep winning for resize.
      const edgeBox = !calloutHit
        ? boxEdgeHitAtPoint(currentDocument(state), point, view.scale())
        : null
      if (edgeBox) {
        event.preventDefault()
        const origin = currentDocument(state)
        store.set(setSelectedAnnotation(state, edgeBox.id))
        canvas.style.cursor = canvasCursor({ kind: 'grabbing' })
        gesture = {
          mode: 'annotation-move',
          annotation: edgeBox,
          origin,
          last: point,
          moved: false,
        }
        return
      }

      if (drawing) {
        // Drawing wins over moving for boxes/arrows/text, so a drag inside an
        // existing box starts a nested box instead of dragging the outer one. A
        // body only moves once it is selected: click to select, then drag to
        // move. Callouts keep grabbing immediately so a bubble still moves (or
        // opens for typing) in any tool.
        if (calloutBody) {
          event.preventDefault()
          const origin = currentDocument(state)
          store.set(setSelectedAnnotation(state, calloutBody.id))
          canvas.style.cursor = canvasCursor({ kind: 'move' })
          gesture = {
            mode: 'callout-move',
            callout: calloutBody,
            origin,
            last: point,
            moved: false,
          }
          return
        }
        if (editableBody) {
          // Even a selected box keeps drawing from its interior; moving is the
          // edge's job, or any body drag once another tool takes over.
          gesture = { mode: 'draw', pressEditable: editableBody }
          canvas.style.cursor = RETICLE_CURSOR
          store.set(setDraft(state, beginDraft(state.tool, point)))
          return
        }
        // Pressing empty canvas drops the selection; trim/draw below takes over.
        store.set(setSelectedAnnotation(state, null))
      } else if (textTool) {
        // The Text tool places inside boxes. Callouts still win so any tool can
        // reopen a note; boxes/arrows/text only move once selected.
        if (calloutBody) {
          event.preventDefault()
          const origin = currentDocument(state)
          store.set(setSelectedAnnotation(state, calloutBody.id))
          canvas.style.cursor = canvasCursor({ kind: 'move' })
          gesture = {
            mode: 'callout-move',
            callout: calloutBody,
            origin,
            last: point,
            moved: false,
          }
          return
        }
        if (editableBody) {
          if (editableBody.id === state.selectedAnnotationId) {
            event.preventDefault()
            const origin = currentDocument(state)
            canvas.style.cursor = canvasCursor({ kind: 'move' })
            gesture = {
              mode: 'annotation-move',
              annotation: editableBody,
              origin,
              last: point,
              moved: false,
            }
            return
          }
          // Fall through to place text inside the unselected shape.
          store.set(setSelectedAnnotation(state, null))
        } else {
          // Pressing empty canvas drops the selection.
          store.set(setSelectedAnnotation(state, null))
        }
      } else {
        // Crop and any future non-drawing tool: bodies grab immediately.
        if (calloutBody) {
          event.preventDefault()
          const origin = currentDocument(state)
          store.set(setSelectedAnnotation(state, calloutBody.id))
          canvas.style.cursor = canvasCursor({ kind: 'move' })
          gesture = {
            mode: 'callout-move',
            callout: calloutBody,
            origin,
            last: point,
            moved: false,
          }
          return
        }
        if (editableBody) {
          event.preventDefault()
          const origin = currentDocument(state)
          store.set(setSelectedAnnotation(state, editableBody.id))
          canvas.style.cursor = canvasCursor({ kind: 'move' })
          gesture = {
            mode: 'annotation-move',
            annotation: editableBody,
            origin,
            last: point,
            moved: false,
          }
          return
        }
        // Pressing empty canvas drops the selection.
        store.set(setSelectedAnnotation(state, null))
      }
    }

    if (state.cropSession?.mode === 'reframe') {
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

    // Trimming wins over the tool's own drag: these handles are only on the edges,
    // where a drawing drag has nowhere to go anyway.
    const trimHandle = trimHandleAt(state, point)
    if (trimHandle) {
      event.preventDefault()
      canvas.style.cursor = canvasCursor({ kind: 'resize', cursor: cursorForHandle(trimHandle) })
      gesture = { mode: 'crop-trim', handle: trimHandle }
      store.set(beginTrim(state, cropBounds(currentDocument(state), 'trim')))
      return
    }

    if (state.tool === 'text') {
      // The default mousedown focus change would blur the field straight away.
      event.preventDefault()
      handlers.onTextPoint(event, point)
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

    if (gesture.mode === 'callout-resize') {
      const { callout: target, handle } = gesture
      store.set(
        previewDocument(
          state,
          updateAnnotation(currentDocument(state), target.id, (annotation) =>
            annotation.kind === 'callout'
              ? // Text is sized by the bubble, so it refits on every frame.
                refitCallout(
                  { ...annotation, rect: resizeRect(annotation.rect, handle, point) },
                  textMeasurer,
                )
              : annotation,
          ),
        ),
      )
      return
    }

    if (gesture.mode === 'callout-tail') {
      const moved =
        gesture.moved ||
        Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) * view.scale() >
          CALLOUT_DRAG_THRESHOLD
      if (!moved) return
      store.set(
        previewDocument(
          state,
          updateAnnotation(currentDocument(state), gesture.callout.id, (annotation) =>
            annotation.kind === 'callout' ? { ...annotation, tail: point } : annotation,
          ),
        ),
      )
      gesture = { ...gesture, moved: true }
      return
    }

    if (gesture.mode === 'annotation-move') {
      const dx = point.x - gesture.last.x
      const dy = point.y - gesture.last.y
      const moved = gesture.moved || Math.hypot(dx, dy) * view.scale() > CALLOUT_DRAG_THRESHOLD
      if (!moved) return
      canvas.style.cursor = canvasCursor({ kind: 'grabbing' })
      store.set(
        previewDocument(
          state,
          updateAnnotation(currentDocument(state), gesture.annotation.id, (annotation) =>
            moveAnnotation(annotation, dx, dy),
          ),
        ),
      )
      gesture = { ...gesture, last: point, moved: true }
      return
    }

    if (gesture.mode === 'annotation-resize') {
      const { annotation: target, handle, last } = gesture
      const moved =
        gesture.moved || Math.hypot(point.x - last.x, point.y - last.y) * view.scale() > CALLOUT_DRAG_THRESHOLD
      if (!moved) return
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
      gesture = { ...gesture, last: point, moved: true }
      return
    }

    const session = state.cropSession
    if (!session) return
    const bounds = cropBounds(currentDocument(state), session.mode)

    if (gesture.mode === 'crop-resize' || gesture.mode === 'crop-trim') {
      const resized = resizeRect(session.rect, gesture.handle, point)
      store.set(setCropRect(state, constrainCropRect(resized, bounds)))
      return
    }

    if (gesture.mode === 'crop-move') {
      const dx = point.x - gesture.last.x
      const dy = point.y - gesture.last.y
      store.set(setCropRect(state, moveCropRect(session.rect, dx, dy, bounds)))
      gesture = { ...gesture, last: point }
    }
  })

  /** Shows handles / the delete badge, and the cursor, for whatever is under the pointer. */
  function updateHover(state: EditorState, point: Point): void {
    if (state.cropSession?.mode === 'reframe') {
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

    const calloutHit = calloutHitAtPoint(currentDocument(state), point, view.scale())
    if (calloutHit) {
      canvas.style.cursor = canvasCursor(calloutCursor(calloutHit))
      store.set(setHoveredAnnotation(state, calloutHit.callout.id))
      return
    }

    const editHit = editableHitAtPoint(currentDocument(state), point, view.scale())
    if (editHit?.handle) {
      canvas.style.cursor = canvasCursor({
        kind: 'resize',
        cursor: cursorForHandle(editHit.handle),
      })
      store.set(setHoveredAnnotation(state, editHit.annotation.id))
      return
    }

    // Box edges advertise the hand: touching one moves the box even when it is
    // not selected. Anywhere else inside still draws (nesting).
    const edgeBox = !calloutHit
      ? boxEdgeHitAtPoint(currentDocument(state), point, view.scale())
      : null
    if (edgeBox) {
      canvas.style.cursor = canvasCursor({ kind: 'grab' })
      store.set(setHoveredAnnotation(state, edgeBox.id))
      return
    }

    if (editHit) {
      if (
        isDrawingTool(state.tool) ||
        (state.tool === 'text' && editHit.annotation.id !== state.selectedAnnotationId)
      ) {
        // Bodies draw (or place text) on drag; edges move, handled above.
        canvas.style.cursor = RETICLE_CURSOR
        store.set(setHoveredAnnotation(state, null))
        return
      }
      canvas.style.cursor = canvasCursor({ kind: 'move' })
      store.set(setHoveredAnnotation(state, editHit.annotation.id))
      return
    }

    const trimHandle = trimHandleAt(state, point)
    if (trimHandle) {
      canvas.style.cursor = canvasCursor({
        kind: 'resize',
        cursor: cursorForHandle(trimHandle),
      })
      store.set(setHoveredAnnotation(state, null))
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

    if (
      finished.mode === 'annotation-move' ||
      finished.mode === 'annotation-resize' ||
      finished.mode === 'callout-resize' ||
      finished.mode === 'callout-tail'
    ) {
      // A click on an annotation selects it; a drag applies the change. Either
      // way the preview resolves to the document, but only the drag commits it.
      if (finished.mode === 'annotation-move' && !finished.moved) return
      if (finished.mode === 'annotation-resize' && !finished.moved) return
      if (finished.mode === 'callout-tail' && !finished.moved) return
      store.set(commitPreview(state, finished.origin))
      return
    }

    // Letting go is what applies a trim: the view resizes to the frame here.
    if (finished.mode === 'crop-trim') {
      store.set(commitCrop(state))
      return
    }

    // The Crop tool's own gesture only adjusts the working frame; Enter commits it.
    if (finished.mode !== 'draw') return

    if (state.draft) {
      // A drag too small to be a shape leaves nothing behind, callouts included:
      // a stray click on the capture should not litter it with empty bubbles.
      // A click that started on a shape selects it instead, so bodies only move
      // once selected and drawing inside a box nests rather than drags it.
      const doc = currentDocument(state)
      const id = newId()
      const annotation = draftToAnnotation(state.draft, state.style, id, outputSize(doc))
      if (!annotation) {
        if (finished.pressCallout) {
          const selected = setSelectedAnnotation(setDraft(state, null), finished.pressCallout.id)
          store.set(selected)
          handlers.onCalloutEdit(finished.pressCallout)
          return
        }
        if (finished.pressEditable) {
          store.set(setSelectedAnnotation(setDraft(state, null), finished.pressEditable.id))
          return
        }
        store.set(setDraft(state, null))
        return
      }
      // Leave the new shape unselected so a follow-up drag inside it nests
      // again instead of dragging it. To move it, click to select then drag.
      const committed = commitDocument(state, addAnnotation(doc, annotation))
      store.set(setSelectedAnnotation(committed, null))
      if (annotation.kind === 'callout') handlers.onCalloutEdit(annotation)
      return
    }

    if (finished.pressCallout) {
      handlers.onCalloutEdit(finished.pressCallout)
      return
    }
    if (finished.pressEditable) {
      store.set(setSelectedAnnotation(state, finished.pressEditable.id))
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
      abandoned.mode === 'callout-tail' ||
      abandoned.mode === 'annotation-move' ||
      abandoned.mode === 'annotation-resize'
    ) {
      if (
        (abandoned.mode === 'callout-move' ||
          abandoned.mode === 'callout-tail' ||
          abandoned.mode === 'annotation-move' ||
          abandoned.mode === 'annotation-resize') &&
        !abandoned.moved
      ) {
        return
      }
      store.set(commitPreview(store.get(), abandoned.origin))
      return
    }

    // The mouseup that would apply a trim lands outside the canvas, so apply it
    // here instead — otherwise the frame is left dimming a view nothing can end.
    if (abandoned.mode === 'crop-trim') {
      store.set(commitCrop(store.get()))
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
