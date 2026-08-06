import { describe, expect, it } from 'vitest'
import { createDocument } from '@shared/document'
import { DEFAULT_FONT_SIZE, DEFAULT_STROKE_WIDTH } from '@shared/constants'
import {
  beginDraft,
  calloutRect,
  createCallout,
  defaultStyle,
  documentWithDraft,
  draftToAnnotation,
  isDrawingTool,
  type ToolId,
  updateDraft,
} from '@shared/tools'

const style = { color: '#ff3b30', strokeWidth: 3, fontSize: 18 }

function drag(tool: Parameters<typeof beginDraft>[0], x2 = 110, y2 = 90) {
  return updateDraft(beginDraft(tool, { x: 10, y: 10 }), { x: x2, y: y2 })
}

describe('defaultStyle', () => {
  it('uses the configured stroke width and font size', () => {
    expect(defaultStyle()).toMatchObject({
      strokeWidth: DEFAULT_STROKE_WIDTH,
      fontSize: DEFAULT_FONT_SIZE,
    })
  })

  it('provides a colour', () => {
    expect(defaultStyle().color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('beginDraft / updateDraft', () => {
  it('records the start point and tracks the current point', () => {
    const draft = drag('box')
    expect(draft.start).toEqual({ x: 10, y: 10 })
    expect(draft.current).toEqual({ x: 110, y: 90 })
  })

  it('does not mutate the previous draft', () => {
    const first = beginDraft('box', { x: 0, y: 0 })
    updateDraft(first, { x: 50, y: 50 })
    expect(first.current).toEqual({ x: 0, y: 0 })
  })
})

describe('draftToAnnotation', () => {
  it('builds a box from a drag', () => {
    expect(draftToAnnotation(drag('box'), style, 'a1')).toEqual({
      id: 'a1', kind: 'box',
      rect: { x: 10, y: 10, width: 100, height: 80 },
      color: '#ff3b30', strokeWidth: 3,
    })
  })

  it('builds an arrow preserving direction, not a normalized rect', () => {
    const draft = updateDraft(beginDraft('arrow', { x: 200, y: 200 }), { x: 50, y: 20 })
    expect(draftToAnnotation(draft, style, 'a2')).toEqual({
      id: 'a2', kind: 'arrow',
      from: { x: 200, y: 200 }, to: { x: 50, y: 20 },
      color: '#ff3b30', strokeWidth: 3,
    })
  })

  it('builds a highlight from a drag', () => {
    expect(draftToAnnotation(drag('highlight'), style, 'a3')).toMatchObject({
      kind: 'highlight', color: '#ff3b30',
    })
  })

  it('builds a blur with no colour of its own', () => {
    const blur = draftToAnnotation(drag('blur'), style, 'a4')
    expect(blur).toEqual({
      id: 'a4', kind: 'blur', rect: { x: 10, y: 10, width: 100, height: 80 },
    })
  })

  it('returns null for a drag too small to be intentional', () => {
    expect(draftToAnnotation(drag('box', 11, 11), style, 'a5')).toBeNull()
  })

  it('returns null for tools that do not produce annotations', () => {
    expect(draftToAnnotation(drag('crop'), style, 'a6')).toBeNull()
    expect(draftToAnnotation(drag('text'), style, 'a8')).toBeNull()
  })
})

describe('callouts', () => {
  it('builds a bubble with empty text from a drag, ready for typing', () => {
    expect(draftToAnnotation(drag('callout'), style, 'a9')).toMatchObject({
      id: 'a9',
      kind: 'callout',
      rect: { x: 10, y: 10, width: 100, height: 80 },
      text: '',
      color: '#ff3b30',
    })
  })

  it('sizes the text to the bubble rather than to the toolbar font size', () => {
    const small = createCallout({ x: 0, y: 0, width: 100, height: 40 }, style, 'c0')
    const large = createCallout({ x: 0, y: 0, width: 400, height: 200 }, style, 'c1')
    expect(large.fontSize).toBeGreaterThan(small.fontSize)
    expect(large.fontSize).toBeGreaterThan(style.fontSize)
  })

  it('points the tail below the bubble by default', () => {
    const callout = createCallout({ x: 0, y: 0, width: 100, height: 40 }, style, 'c1')
    expect(callout.tail.x).toBe(50)
    expect(callout.tail.y).toBeGreaterThan(40)
  })

  it('keeps the dragged bubble when the drag is a real one', () => {
    expect(calloutRect(drag('callout'), style)).toEqual({
      x: 10, y: 10, width: 100, height: 80,
    })
  })

  it('falls back to a default-sized bubble when the drag was really a click', () => {
    const rect = calloutRect(drag('callout', 11, 11), style)
    expect(rect).toMatchObject({ x: 10, y: 10 })
    expect(rect.width).toBeGreaterThan(0)
    expect(rect.height).toBeGreaterThan(0)
  })
})

describe('isDrawingTool', () => {
  it('treats shape tools as drawing tools', () => {
    const drawing: readonly ToolId[] = ['box', 'arrow', 'highlight', 'blur', 'callout']
    expect(drawing.every(isDrawingTool)).toBe(true)
  })

  it('excludes text and crop', () => {
    const other: readonly ToolId[] = ['text', 'crop']
    expect(other.some(isDrawingTool)).toBe(false)
  })
})

describe('documentWithDraft', () => {
  const doc = createDocument('d', 200, 100)

  it('appends a paint-only box annotation for a box draft', () => {
    const next = documentWithDraft(doc, drag('box'), style)
    expect(next.annotations).toHaveLength(1)
    expect(next.annotations[0]).toMatchObject({
      id: '__draft__',
      kind: 'box',
      rect: { x: 10, y: 10, width: 100, height: 80 },
    })
    expect(doc.annotations).toHaveLength(0)
  })

  it('returns the same document for null, degenerate, or crop drafts', () => {
    expect(documentWithDraft(doc, null, style)).toBe(doc)
    expect(documentWithDraft(doc, drag('box', 11, 11), style)).toBe(doc)
    expect(documentWithDraft(doc, drag('crop'), style)).toBe(doc)
  })

  it('keeps existing annotations under the draft', () => {
    const withBox = {
      ...doc,
      annotations: [
        {
          id: 'existing',
          kind: 'box' as const,
          rect: { x: 0, y: 0, width: 20, height: 20 },
          color: '#000000',
          strokeWidth: 2,
        },
      ],
    }
    const next = documentWithDraft(withBox, drag('arrow'), style)
    expect(next.annotations.map((a) => a.id)).toEqual(['existing', '__draft__'])
    expect(next.annotations[1]?.kind).toBe('arrow')
  })
})
