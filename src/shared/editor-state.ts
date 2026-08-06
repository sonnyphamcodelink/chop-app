import { setCrop, type CaptureDocument } from './document'
import { fullImageRect, initialCropRect } from './crop-session'
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
  /** Working crop frame while Crop is active; null otherwise. */
  readonly cropSession: { readonly rect: Rect } | null
  /** Callout under the pointer, which shows its delete badge. */
  readonly hoveredCalloutId: string | null
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
    hoveredCalloutId: null,
    editingCalloutId: null,
  }
}

export function setHoveredCallout(state: EditorState, id: string | null): EditorState {
  if (state.hoveredCalloutId === id) return state
  return { ...state, hoveredCalloutId: id }
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
      cropSession: { rect: initialCropRect(currentDocument(state)) },
    }
  }
  return { ...state, tool, draft: null, cropSession: null }
}

export function setCropSession(state: EditorState, rect: Rect | null): EditorState {
  return {
    ...state,
    cropSession: rect ? { rect } : null,
  }
}

export function commitCrop(state: EditorState): EditorState {
  if (!state.cropSession) return state
  const rect = state.cropSession.rect
  const doc = currentDocument(state)
  const unchanged = doc.cropRect
    ? rectsEqual(doc.cropRect, rect)
    : rectsEqual(fullImageRect(doc), rect)
  if (unchanged) return state
  return {
    ...commitDocument(state, setCrop(doc, rect)),
    cropSession: { rect },
    tool: 'crop',
  }
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
  const next = { ...state, history, draft: null }
  if (next.tool !== 'crop') return { ...next, cropSession: null }
  return { ...next, cropSession: { rect: initialCropRect(history.present) } }
}

export function redoState(state: EditorState): EditorState {
  const history = redo(state.history)
  const next = { ...state, history, draft: null }
  if (next.tool !== 'crop') return { ...next, cropSession: null }
  return { ...next, cropSession: { rect: initialCropRect(history.present) } }
}
