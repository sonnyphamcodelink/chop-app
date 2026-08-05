import { describe, expect, it } from 'vitest'
import { addAnnotation, type Annotation, createDocument } from '@shared/document'
import {
  commitDocument,
  createEditorState,
  currentDocument,
  deleteSelected,
  previewDocument,
  redoState,
  selectAnnotation,
  setDraft,
  setStyle,
  setTool,
  undoState,
} from '@shared/editor-state'
import { beginDraft } from '@shared/tools'

const box: Annotation = {
  id: 'b1', kind: 'box',
  rect: { x: 0, y: 0, width: 10, height: 10 },
  color: '#f00', strokeWidth: 3,
}

const base = createDocument('d', 800, 600)

describe('createEditorState', () => {
  it('starts on the select tool with nothing selected', () => {
    const state = createEditorState(base)
    expect(state.tool).toBe('select')
    expect(state.selectedId).toBeNull()
    expect(state.draft).toBeNull()
    expect(currentDocument(state)).toEqual(base)
  })
})

describe('setTool', () => {
  it('switches the active tool', () => {
    expect(setTool(createEditorState(base), 'arrow').tool).toBe('arrow')
  })

  it('clears the selection when leaving the select tool', () => {
    const selected = selectAnnotation(createEditorState(base), 'b1')
    expect(setTool(selected, 'box').selectedId).toBeNull()
  })

  it('keeps the selection when staying on select', () => {
    const selected = selectAnnotation(createEditorState(base), 'b1')
    expect(setTool(selected, 'select').selectedId).toBe('b1')
  })
})

describe('setStyle', () => {
  it('merges a partial style patch', () => {
    const state = setStyle(createEditorState(base), { color: '#00ff00' })
    expect(state.style.color).toBe('#00ff00')
    expect(state.style.strokeWidth).toBeGreaterThan(0)
  })
})

describe('setDraft', () => {
  it('stores and clears the draft', () => {
    const drafted = setDraft(createEditorState(base), beginDraft('box', { x: 1, y: 1 }))
    expect(drafted.draft?.tool).toBe('box')
    expect(setDraft(drafted, null).draft).toBeNull()
  })
})

describe('commitDocument vs previewDocument', () => {
  it('commit makes the change undoable', () => {
    const state = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(currentDocument(state).annotations).toHaveLength(1)
    expect(currentDocument(undoState(state)).annotations).toHaveLength(0)
  })

  it('preview does not grow the undo stack', () => {
    const state = previewDocument(createEditorState(base), addAnnotation(base, box))
    expect(state.history.past).toHaveLength(0)
    expect(currentDocument(state).annotations).toHaveLength(1)
  })

  it('commit clears the draft', () => {
    const drafted = setDraft(createEditorState(base), beginDraft('box', { x: 1, y: 1 }))
    expect(commitDocument(drafted, addAnnotation(base, box)).draft).toBeNull()
  })
})

describe('deleteSelected', () => {
  it('removes the selected annotation and clears the selection', () => {
    const withBox = commitDocument(createEditorState(base), addAnnotation(base, box))
    const state = deleteSelected(selectAnnotation(withBox, 'b1'))
    expect(currentDocument(state).annotations).toHaveLength(0)
    expect(state.selectedId).toBeNull()
  })

  it('is undoable', () => {
    const withBox = commitDocument(createEditorState(base), addAnnotation(base, box))
    const deleted = deleteSelected(selectAnnotation(withBox, 'b1'))
    expect(currentDocument(undoState(deleted)).annotations).toHaveLength(1)
  })

  it('is a no-op when nothing is selected', () => {
    const withBox = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(deleteSelected(withBox)).toEqual(withBox)
  })
})

describe('undoState / redoState', () => {
  it('round-trips a commit', () => {
    const state = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(currentDocument(redoState(undoState(state)))).toEqual(currentDocument(state))
  })

  it('clears the selection on undo so no stale id remains', () => {
    const withBox = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(undoState(selectAnnotation(withBox, 'b1')).selectedId).toBeNull()
  })
})
