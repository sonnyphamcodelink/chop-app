import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT_SIZE, DEFAULT_STROKE_WIDTH } from '@shared/constants'
import {
  beginDraft,
  defaultStyle,
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
    expect(draftToAnnotation(drag('select'), style, 'a7')).toBeNull()
    expect(draftToAnnotation(drag('text'), style, 'a8')).toBeNull()
  })
})

describe('isDrawingTool', () => {
  it('treats shape tools as drawing tools', () => {
    const drawing: readonly ToolId[] = ['box', 'arrow', 'highlight', 'blur']
    expect(drawing.every(isDrawingTool)).toBe(true)
  })

  it('excludes select, text, and crop', () => {
    const other: readonly ToolId[] = ['select', 'text', 'crop']
    expect(other.some(isDrawingTool)).toBe(false)
  })
})
