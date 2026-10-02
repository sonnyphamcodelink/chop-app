import { describe, expect, it } from 'vitest'
import { type CalloutAnnotation, createDocument } from '@shared/document'
import {
  CALLOUT_DEFAULT_ASPECT,
  CALLOUT_DEFAULT_WIDTH_SHARE,
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE_WIDTH,
} from '@shared/constants'
import {
  beginDraft,
  createCallout,
  defaultStyle,
  documentWithDraft,
  type Draft,
  draftToAnnotation,
  isDrawingTool,
  type ToolId,
  updateDraft,
} from '@shared/tools'

const style = { color: '#ff3b30', strokeWidth: 3, fontSize: 18 }

/** The capture a draft lands on, retina-sized. Only a callout's default size reads it. */
const view = { width: 2000, height: 1200 }

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
    expect(draftToAnnotation(drag('box'), style, 'a1', view)).toEqual({
      id: 'a1', kind: 'box',
      rect: { x: 10, y: 10, width: 100, height: 80 },
      color: '#ff3b30', strokeWidth: 3,
    })
  })

  it('builds an arrow preserving direction, not a normalized rect', () => {
    const draft = updateDraft(beginDraft('arrow', { x: 200, y: 200 }), { x: 50, y: 20 })
    expect(draftToAnnotation(draft, style, 'a2', view)).toEqual({
      id: 'a2', kind: 'arrow',
      from: { x: 200, y: 200 }, to: { x: 50, y: 20 },
      color: '#ff3b30', strokeWidth: 3,
    })
  })

  it('builds a highlight from a drag', () => {
    expect(draftToAnnotation(drag('highlight'), style, 'a3', view)).toMatchObject({
      kind: 'highlight', color: '#ff3b30',
    })
  })

  it('builds a blur with no colour of its own', () => {
    const blur = draftToAnnotation(drag('blur'), style, 'a4', view)
    expect(blur).toEqual({
      id: 'a4', kind: 'blur', rect: { x: 10, y: 10, width: 100, height: 80 },
    })
  })

  it('returns null for a drag too small to be intentional', () => {
    expect(draftToAnnotation(drag('box', 11, 11), style, 'a5', view)).toBeNull()
  })

  it('returns null for tools that do not produce annotations', () => {
    expect(draftToAnnotation(drag('crop'), style, 'a6', view)).toBeNull()
    expect(draftToAnnotation(drag('text'), style, 'a8', view)).toBeNull()
  })
})

describe('callouts', () => {
  /** Fix the arrow tip at (140, 400), then drag back to place its bubble. */
  const aimed = updateDraft(beginDraft('callout', { x: 140, y: 400 }), { x: 200, y: 300 })

  function builtFrom(draft: Draft): CalloutAnnotation {
    const annotation = draftToAnnotation(draft, style, 'a9', view)
    if (annotation?.kind !== 'callout') throw new Error('expected a callout')
    return annotation
  }

  it('builds a bubble with empty text, ready for typing', () => {
    expect(builtFrom(aimed)).toMatchObject({ id: 'a9', text: '', color: '#ff3b30' })
  })

  it('keeps the arrow tip fixed at the press point', () => {
    expect(builtFrom(aimed).tail).toEqual({ x: 140, y: 400 })
  })

  it('places the bubble beyond the release point, away from the arrow tip', () => {
    const { rect } = builtFrom(aimed)
    expect({ x: rect.x, y: rect.y + rect.height }).toEqual({ x: 200, y: 300 })
  })

  it('sizes the bubble to the capture, so a note lands usable without resizing', () => {
    const { rect } = builtFrom(aimed)
    expect(rect.width).toBeCloseTo(view.width * CALLOUT_DEFAULT_WIDTH_SHARE)
    expect(rect.width / rect.height).toBeCloseTo(CALLOUT_DEFAULT_ASPECT, 1)
  })

  it('sizes the text to the bubble rather than to the toolbar font size', () => {
    const tip = { x: 0, y: 400 }
    const small = createCallout({ x: 0, y: 0, width: 100, height: 40 }, tip, style, 'c0')
    const large = createCallout({ x: 0, y: 0, width: 400, height: 200 }, tip, style, 'c1')
    expect(large.fontSize).toBeGreaterThan(small.fontSize)
    expect(large.fontSize).toBeGreaterThan(style.fontSize)
  })

  it('builds nothing until the arrow reaches the minimum useful length', () => {
    const short = updateDraft(beginDraft('callout', { x: 200, y: 300 }), { x: 227, y: 300 })
    const longEnough = updateDraft(
      beginDraft('callout', { x: 200, y: 300 }),
      { x: 228, y: 300 },
    )
    expect(draftToAnnotation(short, style, 'c2', view)).toBeNull()
    expect(draftToAnnotation(longEnough, style, 'c3', view)?.kind).toBe('callout')
  })

  it('uses the active stroke width for the callout arrow', () => {
    expect(builtFrom(aimed).strokeWidth).toBe(style.strokeWidth)
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

  it('previews only an arrow while a callout drag is still too short to place', () => {
    const short = updateDraft(
      beginDraft('callout', { x: 80, y: 90 }),
      { x: 100, y: 90 },
    )
    expect(documentWithDraft(doc, short, style).annotations).toEqual([
      {
        id: '__draft__',
        kind: 'arrow',
        from: { x: 100, y: 90 },
        to: { x: 80, y: 90 },
        color: style.color,
        strokeWidth: 5.4,
      },
    ])
  })

  it('previews the complete callout once its arrow is long enough', () => {
    const longEnough = updateDraft(
      beginDraft('callout', { x: 80, y: 90 }),
      { x: 108, y: 90 },
    )
    expect(documentWithDraft(doc, longEnough, style).annotations[0]?.kind).toBe('callout')
  })
})
