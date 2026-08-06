import { describe, expect, it } from 'vitest'
import { addAnnotation, type Annotation, createDocument, setCrop } from '@shared/document'
import {
  beginTrim,
  commitCrop,
  commitDocument,
  createEditorState,
  currentDocument,
  previewDocument,
  setCropRect,
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

  it('entering crop opens a reframe session', () => {
    expect(setTool(createEditorState(base), 'crop').cropSession?.mode).toBe('reframe')
  })
})

describe('trimming outside the crop tool', () => {
  it('opens a trim session on the frame it was handed, keeping the tool', () => {
    const drawing = setTool(createEditorState(base), 'box')
    const trimming = beginTrim(drawing, { x: 0, y: 0, width: 800, height: 600 })
    expect(trimming.cropSession).toEqual({
      rect: { x: 0, y: 0, width: 800, height: 600 },
      mode: 'trim',
    })
    expect(trimming.tool).toBe('box')
  })

  it('drops any draft, so a half-started shape is not left behind the frame', () => {
    const drafted = setDraft(setTool(createEditorState(base), 'box'), beginDraft('box', { x: 1, y: 1 }))
    expect(beginTrim(drafted, { x: 0, y: 0, width: 800, height: 600 }).draft).toBeNull()
  })

  it('commitCrop writes the crop and ends the session, since the mouse is already up', () => {
    const trimming = setCropRect(
      beginTrim(setTool(createEditorState(base), 'box'), { x: 0, y: 0, width: 800, height: 600 }),
      { x: 0, y: 0, width: 500, height: 400 },
    )
    const committed = commitCrop(trimming)
    expect(currentDocument(committed).cropRect).toEqual({
      x: 0, y: 0, width: 500, height: 400,
    })
    expect(committed.cropSession).toBeNull()
    expect(committed.tool).toBe('box')
  })

  it('a trim that changed nothing still ends the session and writes no history', () => {
    const drawing = setTool(createEditorState(base), 'box')
    const trimming = beginTrim(drawing, { x: 0, y: 0, width: 800, height: 600 })
    const committed = commitCrop(trimming)
    expect(committed.cropSession).toBeNull()
    expect(committed.history.past).toHaveLength(0)
    expect(currentDocument(committed).cropRect).toBeNull()
  })

  it('undo steps back over a committed trim in one go', () => {
    const trimming = setCropRect(
      beginTrim(setTool(createEditorState(base), 'box'), { x: 0, y: 0, width: 800, height: 600 }),
      { x: 0, y: 0, width: 500, height: 400 },
    )
    expect(currentDocument(undoState(commitCrop(trimming))).cropRect).toBeNull()
  })

  it('a second trim cuts further into the crop the first one left', () => {
    const first = commitCrop(
      setCropRect(
        beginTrim(setTool(createEditorState(base), 'box'), { x: 0, y: 0, width: 800, height: 600 }),
        { x: 0, y: 0, width: 500, height: 400 },
      ),
    )
    const second = commitCrop(
      setCropRect(beginTrim(first, { x: 0, y: 0, width: 500, height: 400 }), {
        x: 20, y: 30, width: 300, height: 200,
      }),
    )
    expect(currentDocument(second).cropRect).toEqual({
      x: 20, y: 30, width: 300, height: 200,
    })
  })
})

describe('the crop tool frame', () => {
  it('updates the working rect without touching history', () => {
    const cropping = setTool(createEditorState(base), 'crop')
    const next = setCropRect(cropping, { x: 5, y: 5, width: 50, height: 40 })
    expect(next.cropSession?.rect).toEqual({ x: 5, y: 5, width: 50, height: 40 })
    expect(next.history.past).toHaveLength(0)
    expect(currentDocument(next).cropRect).toBeNull()
  })

  it('commitCrop writes cropRect and keeps the session on that rect', () => {
    const cropping = setCropRect(
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

  it('commitCrop is a no-op when the session rect matches the existing cropRect', () => {
    const cropped = commitDocument(
      createEditorState(base),
      setCrop(base, { x: 10, y: 20, width: 100, height: 80 }),
    )
    const cropping = setCropRect(
      setTool(cropped, 'crop'),
      { x: 10, y: 20, width: 100, height: 80 },
    )
    const committed = commitCrop(cropping)
    expect(committed.history.past).toHaveLength(cropping.history.past.length)
    expect(committed).toEqual(cropping)
  })

  it('commitCrop is a no-op when cropRect is null and the session is the full image', () => {
    const cropping = setTool(createEditorState(base), 'crop')
    expect(cropping.cropSession?.rect).toEqual({ x: 0, y: 0, width: 800, height: 600 })
    const committed = commitCrop(cropping)
    expect(committed.history.past).toHaveLength(cropping.history.past.length)
    expect(committed).toEqual(cropping)
    expect(currentDocument(committed).cropRect).toBeNull()
  })

  it('commitCrop still commits when the session rect actually differs', () => {
    const cropped = commitDocument(
      createEditorState(base),
      setCrop(base, { x: 10, y: 20, width: 100, height: 80 }),
    )
    const cropping = setCropRect(
      setTool(cropped, 'crop'),
      { x: 15, y: 20, width: 100, height: 80 },
    )
    const committed = commitCrop(cropping)
    expect(committed.history.past).toHaveLength(cropping.history.past.length + 1)
    expect(currentDocument(committed).cropRect).toEqual({
      x: 15, y: 20, width: 100, height: 80,
    })
  })
})
