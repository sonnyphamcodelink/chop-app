import { addAnnotation, type CaptureDocument, setCrop, updateAnnotation } from '@shared/document'
import {
  commitDocument,
  currentDocument,
  type EditorState,
  previewDocument,
  selectAnnotation,
  setDraft,
} from '@shared/editor-state'
import { isDegenerateRect, normalizeRect, type Point, type Rect } from '@shared/geometry'
import {
  annotationAtPoint,
  annotationBounds,
  type HandleId,
  handleAtPoint,
  moveAnnotation,
  resizeRect,
} from '@shared/hit-test'
import { beginDraft, draftToAnnotation, isDrawingTool, updateDraft } from '@shared/tools'
import type { CanvasView } from './canvas-view'

export type Store = {
  get(): EditorState
  set(state: EditorState): void
}

/**
 * Move and resize preview their result live, so each carries the document as it
 * was before the drag began — that is the snapshot undo must return to.
 */
type Gesture =
  | { readonly mode: 'draw' }
  | { readonly mode: 'crop' }
  | {
      readonly mode: 'move'
      readonly id: string
      readonly last: Point
      readonly before: CaptureDocument
    }
  | {
      readonly mode: 'resize'
      readonly id: string
      readonly handle: HandleId
      readonly before: CaptureDocument
    }

function newId(): string {
  return crypto.randomUUID()
}

/** Applies a rect-shaped edit to whichever annotation kind carries a rect. */
function withRect(id: string, rect: Rect) {
  return (state: EditorState): EditorState =>
    previewDocument(
      state,
      updateAnnotation(currentDocument(state), id, (annotation) =>
        annotation.kind === 'box' ||
        annotation.kind === 'highlight' ||
        annotation.kind === 'blur'
          ? { ...annotation, rect }
          : annotation,
      ),
    )
}

export function attachInteractions(
  canvas: HTMLCanvasElement,
  view: CanvasView,
  store: Store,
  openTextInput: (event: MouseEvent, imagePoint: Point) => void,
): void {
  let gesture: Gesture | null = null

  function startSelectGesture(point: Point): void {
    const state = store.get()
    const before = currentDocument(state)
    const selected = before.annotations.find((a) => a.id === state.selectedId)

    if (selected) {
      const handle = handleAtPoint(annotationBounds(selected), point)
      if (handle) {
        gesture = { mode: 'resize', id: selected.id, handle, before }
        return
      }
    }

    const hit = annotationAtPoint(before, point)
    store.set(selectAnnotation(state, hit?.id ?? null))
    if (hit) gesture = { mode: 'move', id: hit.id, last: point, before }
  }

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    const state = store.get()
    const point = view.toImagePoint(event, state)

    if (state.tool === 'text') {
      openTextInput(event, point)
      return
    }
    if (state.tool === 'select') {
      startSelectGesture(point)
      return
    }
    if (state.tool === 'crop') {
      gesture = { mode: 'crop' }
      store.set(setDraft(state, beginDraft('crop', point)))
      return
    }
    if (isDrawingTool(state.tool)) {
      gesture = { mode: 'draw' }
      store.set(setDraft(state, beginDraft(state.tool, point)))
    }
  })

  canvas.addEventListener('mousemove', (event) => {
    if (!gesture) return
    const state = store.get()
    const point = view.toImagePoint(event, state)

    switch (gesture.mode) {
      case 'draw':
      case 'crop': {
        if (state.draft) store.set(setDraft(state, updateDraft(state.draft, point)))
        return
      }
      case 'move': {
        const dx = point.x - gesture.last.x
        const dy = point.y - gesture.last.y
        const moved = previewDocument(
          state,
          updateAnnotation(currentDocument(state), gesture.id, (a) =>
            moveAnnotation(a, dx, dy),
          ),
        )
        gesture = { ...gesture, last: point }
        store.set(moved)
        return
      }
      case 'resize': {
        const target = gesture
        const annotation = currentDocument(state).annotations.find(
          (a) => a.id === target.id,
        )
        if (!annotation) return
        const next = resizeRect(annotationBounds(annotation), target.handle, point)
        store.set(withRect(annotation.id, next)(state))
        return
      }
    }
  })

  canvas.addEventListener('mouseup', (event) => {
    if (!gesture) return
    const state = store.get()
    const point = view.toImagePoint(event, state)
    const finished = gesture
    gesture = null

    if (finished.mode === 'draw' && state.draft) {
      const annotation = draftToAnnotation(state.draft, state.style, newId())
      store.set(
        annotation
          ? commitDocument(state, addAnnotation(currentDocument(state), annotation))
          : setDraft(state, null),
      )
      return
    }

    if (finished.mode === 'crop' && state.draft) {
      const rect = normalizeRect(state.draft.start, point)
      store.set(
        isDegenerateRect(rect)
          ? setDraft(state, null)
          : commitDocument(state, setCrop(currentDocument(state), rect)),
      )
      return
    }

    // Only move and resize reach here. A draw or crop that lost its draft has
    // nothing to commit and must not fall through to the drag path.
    if (finished.mode !== 'move' && finished.mode !== 'resize') {
      store.set(setDraft(state, null))
      return
    }

    // The move or resize was previewed live, so the present already holds the
    // final position. Rewind to the pre-drag document and commit forward from
    // it, making the whole gesture exactly one undo step.
    const dragged = currentDocument(state)
    store.set(commitDocument(previewDocument(state, finished.before), dragged))
  })

  canvas.addEventListener('mouseleave', () => {
    if (gesture) {
      gesture = null
      store.set(setDraft(store.get(), null))
    }
  })
}
