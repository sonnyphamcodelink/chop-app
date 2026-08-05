import { type CaptureDocument, removeAnnotation } from './document'
import {
  createHistory,
  type History,
  pushHistory,
  redo,
  undo,
} from './history'
import { type Draft, defaultStyle, type ToolId, type ToolStyle } from './tools'

export type EditorState = {
  readonly history: History<CaptureDocument>
  readonly tool: ToolId
  readonly style: ToolStyle
  readonly selectedId: string | null
  readonly draft: Draft | null
}

export function createEditorState(doc: CaptureDocument): EditorState {
  return {
    history: createHistory(doc),
    tool: 'select',
    style: defaultStyle(),
    selectedId: null,
    draft: null,
  }
}

export function currentDocument(state: EditorState): CaptureDocument {
  return state.history.present
}

export function setTool(state: EditorState, tool: ToolId): EditorState {
  return {
    ...state,
    tool,
    // A selection only means something while the select tool is active.
    selectedId: tool === 'select' ? state.selectedId : null,
    draft: null,
  }
}

export function setStyle(state: EditorState, patch: Partial<ToolStyle>): EditorState {
  return { ...state, style: { ...state.style, ...patch } }
}

export function setDraft(state: EditorState, draft: Draft | null): EditorState {
  return { ...state, draft }
}

/** Records an undoable change. */
export function commitDocument(state: EditorState, doc: CaptureDocument): EditorState {
  return { ...state, history: pushHistory(state.history, doc), draft: null }
}

/** Replaces the present without touching history — used during a live drag. */
export function previewDocument(state: EditorState, doc: CaptureDocument): EditorState {
  return { ...state, history: { ...state.history, present: doc } }
}

export function selectAnnotation(state: EditorState, id: string | null): EditorState {
  return { ...state, selectedId: id }
}

export function deleteSelected(state: EditorState): EditorState {
  if (!state.selectedId) return state
  const next = removeAnnotation(currentDocument(state), state.selectedId)
  return { ...commitDocument(state, next), selectedId: null }
}

export function undoState(state: EditorState): EditorState {
  return { ...state, history: undo(state.history), selectedId: null, draft: null }
}

export function redoState(state: EditorState): EditorState {
  return { ...state, history: redo(state.history), selectedId: null, draft: null }
}
