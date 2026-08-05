import { setCrop, type CaptureDocument } from './document'
import { initialCropRect } from './crop-session'
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
  return {
    ...commitDocument(state, setCrop(currentDocument(state), rect)),
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
