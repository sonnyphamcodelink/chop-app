import { type CaptureDocument } from './document'
import {
  createHistory,
  type History,
  pushHistory,
  redo,
  undo,
} from './history'
import type { Rect } from './geometry'
import { type Draft, defaultStyle, type ToolId, type ToolStyle } from './tools'

export type EditorState = {
  readonly history: History<CaptureDocument>
  readonly tool: ToolId
  readonly style: ToolStyle
  readonly draft: Draft | null
  /** Working crop frame while Crop is active; null otherwise. */
  readonly cropSession: { readonly rect: Rect } | null
}

export function createEditorState(doc: CaptureDocument): EditorState {
  return {
    history: createHistory(doc),
    tool: 'box',
    style: defaultStyle(),
    draft: null,
    cropSession: null,
  }
}

export function currentDocument(state: EditorState): CaptureDocument {
  return state.history.present
}

export function setTool(state: EditorState, tool: ToolId): EditorState {
  return {
    ...state,
    tool,
    draft: null,
    // Crop session is started in Task 4 via setTool + begin helpers.
    // For now clear it when leaving crop; Task 4 will initialize on enter.
    cropSession: tool === 'crop' ? state.cropSession : null,
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

export function undoState(state: EditorState): EditorState {
  return { ...state, history: undo(state.history), draft: null }
}

export function redoState(state: EditorState): EditorState {
  return { ...state, history: redo(state.history), draft: null }
}
