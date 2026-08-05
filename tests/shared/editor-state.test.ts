import { describe, expect, it } from 'vitest'
import { addAnnotation, type Annotation, createDocument, setCrop } from '@shared/document'
import {
  commitCrop,
  commitDocument,
  createEditorState,
  currentDocument,
  previewDocument,
  setCropSession,
  setDraft,
  setStyle,
  setTool,
  undoState,
  redoState,
} from '@shared/editor-state'
import { beginDraft } from '@shared/tools'

const box: Annotation = {
  id: 'b1', kind: 'box',
  rect: { x: 0, y: 0, width: 10, height: 10 },
  color: '#f00', strokeWidth: 3,
}

const base = createDocument('d', 800, 600)

describe('createEditorState', () => {
  it('starts on the box tool with no draft', () => {
    const state = createEditorState(base)
    expect(state.tool).toBe('box')
    expect(state.draft).toBeNull()
    expect(currentDocument(state)).toEqual(base)
  })
})

describe('setTool', () => {
  it('switches the active tool and clears the draft', () => {
    const drafted = setDraft(createEditorState(base), beginDraft('box', { x: 1, y: 1 }))
    const next = setTool(drafted, 'arrow')
    expect(next.tool).toBe('arrow')
    expect(next.draft).toBeNull()
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

describe('undoState / redoState', () => {
  it('round-trips a commit', () => {
    const state = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(currentDocument(redoState(undoState(state)))).toEqual(currentDocument(state))
  })

  it('clears the draft on undo', () => {
    const drafted = setDraft(
      commitDocument(createEditorState(base), addAnnotation(base, box)),
      beginDraft('box', { x: 1, y: 1 }),
    )
    expect(undoState(drafted).draft).toBeNull()
  })
})

describe('crop session', () => {
  it('starts a full-image session when entering crop with no cropRect', () => {
    const state = setTool(createEditorState(base), 'crop')
    expect(state.cropSession?.rect).toEqual({ x: 0, y: 0, width: 800, height: 600 })
  })

  it('starts from the committed cropRect when present', () => {
    const cropped = commitDocument(
      createEditorState(base),
      setCrop(base, { x: 10, y: 20, width: 100, height: 80 }),
    )
    expect(setTool(cropped, 'crop').cropSession?.rect).toEqual({
      x: 10, y: 20, width: 100, height: 80,
    })
  })

  it('clears the session when leaving crop', () => {
    const cropping = setTool(createEditorState(base), 'crop')
    expect(setTool(cropping, 'box').cropSession).toBeNull()
  })

  it('updates the working rect without touching history', () => {
    const cropping = setTool(createEditorState(base), 'crop')
    const next = setCropSession(cropping, { x: 5, y: 5, width: 50, height: 40 })
    expect(next.cropSession?.rect).toEqual({ x: 5, y: 5, width: 50, height: 40 })
    expect(next.history.past).toHaveLength(0)
    expect(currentDocument(next).cropRect).toBeNull()
  })

  it('commitCrop writes cropRect and keeps the session on that rect', () => {
    const cropping = setCropSession(
      setTool(createEditorState(base), 'crop'),
      { x: 5, y: 5, width: 50, height: 40 },
    )
    const committed = commitCrop(cropping)
    expect(currentDocument(committed).cropRect).toEqual({
      x: 5, y: 5, width: 50, height: 40,
    })
    expect(committed.cropSession?.rect).toEqual({
      x: 5, y: 5, width: 50, height: 40,
    })
    expect(currentDocument(undoState(committed)).cropRect).toBeNull()
  })
})
