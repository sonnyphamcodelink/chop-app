import { CALLOUT_DRAG_THRESHOLD } from '@shared/constants'
import { constrainCropRect, fullImageRect, moveCropRect } from '@shared/crop-session'
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
  setHoveredCallout,
} from '@shared/editor-state'
import { type Point, rectContains } from '@shared/geometry'
import {
  calloutHitAtPoint,
  type HandleId,
  handleAtPoint,
  moveAnnotation,
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

  /** Callouts are inert while a crop frame is being set. */
  function calloutsInteractive(state: EditorState): boolean {
    return !(state.tool === 'crop' && state.cropSession)
  }

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    // Committing first, because the press below may suppress the overlay's blur.
    handlers.onCanvasPress()
    const state = store.get()
    const point = view.toImagePoint(event, state)

    if (calloutsInteractive(state)) {
      // Callouts answer to the pointer whatever tool is selected: the badge
      // deletes, and the bubble either moves or opens for typing.
      const hit = calloutHitAtPoint(currentDocument(state), point, view.scale())
      if (hit?.part === 'badge') {
        event.preventDefault()
        handlers.onCalloutDelete(hit.callout)
        return
      }
      if (hit) {
        event.preventDefault()
        gesture = {
          mode: 'callout-move',
          callout: hit.callout,
          origin: currentDocument(state),
          last: point,
          moved: false,
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
        gesture = { mode: 'crop-resize', handle }
      } else if (rectContains(rect, point)) {
        gesture = { mode: 'crop-move', last: point }
      }
      return
    }
    if (isDrawingTool(state.tool)) {
      gesture = { mode: 'draw' }
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

  /** Shows the delete badge, and the cursor, for whatever is under the pointer. */
  function updateHover(state: EditorState, point: Point): void {
    const hit = calloutsInteractive(state)
      ? calloutHitAtPoint(currentDocument(state), point, view.scale())
      : null
    canvas.style.cursor = hit ? (hit.part === 'badge' ? 'pointer' : 'move') : ''
    store.set(setHoveredCallout(state, hit?.callout.id ?? null))
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
    store.set(setHoveredCallout(store.get(), null))
    if (!gesture) return
    const abandoned = gesture
    gesture = null

    // Leaving mid-move keeps the bubble where it got to, as one history entry.
    if (abandoned.mode === 'callout-move') {
      if (abandoned.moved) store.set(commitPreview(store.get(), abandoned.origin))
      return
    }
    // Leaving the canvas ends the drag but keeps the frame the user dragged out.
    if (abandoned.mode !== 'draw') return
    store.set(setDraft(store.get(), null))
  })
}
