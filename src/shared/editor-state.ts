import { setCrop, type CaptureDocument } from './document'
import { type CropSession, initialCropRect } from './crop-session'
import {
  createHistory,
  type History,
  pushHistory,
  redo,
  undo,
} from './history'
import { rectsEqual, type Rect } from './geometry'
import { type Draft, defaultStyle, type ToolId, type ToolStyle } from './tools'

export type EditorState = {
  readonly history: History<CaptureDocument>
  readonly tool: ToolId
  readonly style: ToolStyle
  readonly draft: Draft | null
  /** Working crop frame: the Crop tool's, or a trim drag in any other tool. */
  readonly cropSession: CropSession | null
  /** Annotation under the pointer (handles / callout badge). */
  readonly hoveredAnnotationId: string | null
  /** Annotation chosen by clicking, kept after the pointer moves away. */
  readonly selectedAnnotationId: string | null
  /** Callout whose note is being typed, whose text the overlay draws instead. */
  readonly editingCalloutId: string | null
}

export function createEditorState(doc: CaptureDocument): EditorState {
  return {
    history: createHistory(doc),
    tool: 'box',
    style: defaultStyle(),
    draft: null,
    cropSession: null,
    hoveredAnnotationId: null,
    selectedAnnotationId: null,
    editingCalloutId: null,
  }
}

export function setHoveredAnnotation(state: EditorState, id: string | null): EditorState {
  if (state.hoveredAnnotationId === id) return state
  return { ...state, hoveredAnnotationId: id }
}

export function setSelectedAnnotation(state: EditorState, id: string | null): EditorState {
  if (state.selectedAnnotationId === id) return state
  return { ...state, selectedAnnotationId: id }
}

export function setEditingCallout(state: EditorState, id: string | null): EditorState {
  return { ...state, editingCalloutId: id }
}

export function currentDocument(state: EditorState): CaptureDocument {
  return state.history.present
}

export function setTool(state: EditorState, tool: ToolId): EditorState {
  if (tool === 'crop') {
    return {
      ...state,
      tool,
      draft: null,
      selectedAnnotationId: null,
      cropSession: reframeSession(currentDocument(state)),
    }
  }
  return { ...state, tool, draft: null, cropSession: null, selectedAnnotationId: null }
}

function reframeSession(doc: CaptureDocument): CropSession {
  return { rect: initialCropRect(doc), mode: 'reframe' }
}

/**
 * Starts a trim: the crop frame every non-Crop tool offers on the edges of the
 * view it draws on. It lasts only as long as the drag that opened it.
 */
export function beginTrim(state: EditorState, rect: Rect): EditorState {
  return { ...state, draft: null, cropSession: { rect, mode: 'trim' } }
}

/** Moves the working frame, leaving the kind of session it is alone. */
export function setCropRect(state: EditorState, rect: Rect): EditorState {
  if (!state.cropSession) return state
  return { ...state, cropSession: { ...state.cropSession, rect } }
}

export function endCropSession(state: EditorState): EditorState {
  if (!state.cropSession) return state
  return { ...state, cropSession: null }
}

/**
 * Folds the working frame into the document. A trim ends there — releasing the
 * mouse is what applied it. A reframe keeps its session, so the Crop tool stays
 * live on the frame it just committed.
 */
export function commitCrop(state: EditorState): EditorState {
  const session = state.cropSession
  if (!session) return state
  const doc = currentDocument(state)
  if (rectsEqual(initialCropRect(doc), session.rect)) {
    return session.mode === 'trim' ? endCropSession(state) : state
  }
  const committed = commitDocument(state, setCrop(doc, session.rect))
  return session.mode === 'trim'
    ? endCropSession(committed)
    : { ...committed, cropSession: session }
}

export function setStyle(state: EditorState, patch: Partial<ToolStyle>): EditorState {
  return { ...state, style: { ...state.style, ...patch } }
}

export function setDraft(state: EditorState, draft: Draft | null): EditorState {
  return { ...state, draft }
}

export function commitDocument(state: EditorState, doc: CaptureDocument): EditorState {
  return { ...state, history: pushHistory(state.history, doc), draft: null }
}

export function previewDocument(state: EditorState, doc: CaptureDocument): EditorState {
  return { ...state, history: { ...state.history, present: doc } }
}

/**
 * Turns a run of previews into one history entry. A drag or a burst of typing
 * previews every frame; `original` is what the document looked like before it
 * started, so undo steps over the whole gesture rather than each frame of it.
 */
export function commitPreview(
  state: EditorState,
  original: CaptureDocument,
): EditorState {
  const previewed = currentDocument(state)
  if (previewed === original) return state
  return commitDocument(
    { ...state, history: { ...state.history, present: original } },
    previewed,
  )
}

/** Drops a run of previews, restoring the document from before they started. */
export function cancelPreview(
  state: EditorState,
  original: CaptureDocument,
): EditorState {
  return previewDocument(state, original)
}

export function undoState(state: EditorState): EditorState {
  const history = undo(state.history)
  const next = { ...state, history, draft: null, selectedAnnotationId: null }
  if (next.tool !== 'crop') return { ...next, cropSession: null }
  return { ...next, cropSession: reframeSession(history.present) }
}

export function redoState(state: EditorState): EditorState {
  const history = redo(state.history)
  const next = { ...state, history, draft: null, selectedAnnotationId: null }
  if (next.tool !== 'crop') return { ...next, cropSession: null }
  return { ...next, cropSession: reframeSession(history.present) }
}
