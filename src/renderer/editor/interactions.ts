import { addAnnotation } from '@shared/document'
import { constrainCropRect, fullImageRect, moveCropRect } from '@shared/crop-session'
import {
  commitDocument,
  currentDocument,
  type EditorState,
  setCropSession,
  setDraft,
} from '@shared/editor-state'
import { type Point, rectContains } from '@shared/geometry'
import { type HandleId, handleAtPoint, resizeRect } from '@shared/hit-test'
import { beginDraft, draftToAnnotation, isDrawingTool, updateDraft } from '@shared/tools'
import type { CanvasView } from './canvas-view'

export type Store = {
  get(): EditorState
  set(state: EditorState): void
}

type Gesture =
  | { readonly mode: 'draw' }
  | { readonly mode: 'crop-resize'; readonly handle: HandleId }
  | { readonly mode: 'crop-move'; readonly last: Point }

function newId(): string {
  return crypto.randomUUID()
}

export function attachInteractions(
  canvas: HTMLCanvasElement,
  view: CanvasView,
  store: Store,
  openTextInput: (event: MouseEvent, imagePoint: Point) => void,
): void {
  let gesture: Gesture | null = null

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    const state = store.get()
    const point = view.toImagePoint(event, state)

    if (state.tool === 'text') {
      openTextInput(event, point)
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
    if (!gesture) return
    const state = store.get()
    const point = view.toImagePoint(event, state)

    if (gesture.mode === 'draw') {
      if (state.draft) store.set(setDraft(state, updateDraft(state.draft, point)))
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

  canvas.addEventListener('mouseup', () => {
    if (!gesture) return
    const state = store.get()
    const finished = gesture
    gesture = null

    // A crop gesture only adjusts the working frame; Enter commits it.
    if (finished.mode !== 'draw') return

    if (state.draft) {
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
    if (!gesture) return
    const abandoned = gesture
    gesture = null
    // Leaving the canvas ends the drag but keeps the frame the user dragged out.
    if (abandoned.mode !== 'draw') return
    store.set(setDraft(store.get(), null))
  })
}
