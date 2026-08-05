import { addAnnotation, setCrop } from '@shared/document'
import {
  commitDocument,
  currentDocument,
  type EditorState,
  setDraft,
} from '@shared/editor-state'
import { isDegenerateRect, normalizeRect, type Point } from '@shared/geometry'
import { beginDraft, draftToAnnotation, isDrawingTool, updateDraft } from '@shared/tools'
import type { CanvasView } from './canvas-view'

export type Store = {
  get(): EditorState
  set(state: EditorState): void
}

type Gesture =
  | { readonly mode: 'draw' }
  | { readonly mode: 'crop' }

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

    if (state.draft) store.set(setDraft(state, updateDraft(state.draft, point)))
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

    store.set(setDraft(state, null))
  })

  canvas.addEventListener('mouseleave', () => {
    if (gesture) {
      gesture = null
      store.set(setDraft(store.get(), null))
    }
  })
}
