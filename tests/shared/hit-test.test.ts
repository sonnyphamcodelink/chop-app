import { describe, expect, it } from 'vitest'
import { CALLOUT_BADGE_SIZE, HANDLE_SIZE } from '@shared/constants'
import { addAnnotation, type Annotation, createDocument } from '@shared/document'
import { rectContains } from '@shared/geometry'
import {
  annotationAtPoint,
  annotationBounds,
  calloutHitAtPoint,
  handleAtPoint,
  handleRects,
  moveAnnotation,
  resizeRect,
} from '@shared/hit-test'

const box: Annotation = {
  id: 'box', kind: 'box',
  rect: { x: 10, y: 10, width: 100, height: 50 },
  color: '#f00', strokeWidth: 3,
}

const arrow: Annotation = {
  id: 'arrow', kind: 'arrow',
  from: { x: 200, y: 200 }, to: { x: 100, y: 150 },
  color: '#0f0', strokeWidth: 4,
}

const text: Annotation = {
  id: 'text', kind: 'text',
  at: { x: 300, y: 300 }, text: 'hello', color: '#00f', fontSize: 20,
}

describe('annotationBounds', () => {
  it('returns the rect for a box', () => {
    expect(annotationBounds(box)).toEqual({ x: 10, y: 10, width: 100, height: 50 })
  })

  it('normalizes an arrow drawn right-to-left into a positive rect', () => {
    expect(annotationBounds(arrow)).toEqual({ x: 100, y: 150, width: 100, height: 50 })
  })

  it('estimates text bounds from font size and length', () => {
    const bounds = annotationBounds(text)
    expect(bounds.x).toBe(300)
    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.height).toBeGreaterThanOrEqual(20)
  })

  it("includes the tail in a callout's bounds", () => {
    const callout: Annotation = {
      id: 'c', kind: 'callout',
      rect: { x: 100, y: 100, width: 200, height: 80 },
      tail: { x: 200, y: 260 },
      text: 'note', color: '#f00', fontSize: 18,
    }
    expect(annotationBounds(callout)).toEqual({ x: 100, y: 100, width: 200, height: 160 })
  })

  it('returns the rect for highlight and blur', () => {
    const blur: Annotation = { id: 'b', kind: 'blur', rect: { x: 1, y: 2, width: 3, height: 4 } }
    expect(annotationBounds(blur)).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})

describe('annotationAtPoint', () => {
  const doc = addAnnotation(addAnnotation(createDocument('d', 800, 600), box), {
    ...box, id: 'onTop',
  })

  it('returns the front-most annotation when two overlap', () => {
    expect(annotationAtPoint(doc, { x: 50, y: 30 })?.id).toBe('onTop')
  })

  it('returns null when nothing is hit', () => {
    expect(annotationAtPoint(doc, { x: 700, y: 500 })).toBeNull()
  })

  it('returns null for an empty document', () => {
    expect(annotationAtPoint(createDocument('d', 10, 10), { x: 1, y: 1 })).toBeNull()
  })
})

describe('calloutHitAtPoint', () => {
  const callout: Annotation = {
    id: 'callout', kind: 'callout',
    rect: { x: 100, y: 100, width: 200, height: 80 },
    tail: { x: 200, y: 260 },
    text: 'note', color: '#f00', fontSize: 18,
  }
  const doc = addAnnotation(addAnnotation(createDocument('d', 800, 600), box), callout)

  it('reports the bubble body under the point', () => {
    expect(calloutHitAtPoint(doc, { x: 150, y: 120 })).toMatchObject({
      callout: { id: 'callout' },
      part: 'body',
    })
  })

  it('reports the delete badge at the top-right corner', () => {
    // The badge straddles the corner, so its centre is the corner itself.
    expect(calloutHitAtPoint(doc, { x: 300, y: 100 })).toMatchObject({
      callout: { id: 'callout' },
      part: 'badge',
    })
  })

  it('keeps the badge the same size on screen however far the image is zoomed', () => {
    // At half scale a badge covers twice as many image pixels.
    const justOutside = { x: 300 + CALLOUT_BADGE_SIZE / 2 + 1, y: 100 }
    expect(calloutHitAtPoint(doc, justOutside, 1)).toBeNull()
    expect(calloutHitAtPoint(doc, justOutside, 0.5)?.part).toBe('badge')
  })

  it('returns the front-most callout when two bubbles overlap', () => {
    const stacked = addAnnotation(doc, { ...callout, id: 'onTop' })
    expect(calloutHitAtPoint(stacked, { x: 150, y: 120 })?.callout.id).toBe('onTop')
  })

  it('ignores the empty area beside the tail', () => {
    expect(calloutHitAtPoint(doc, { x: 120, y: 240 })).toBeNull()
  })

  it('ignores annotations of other kinds', () => {
    expect(calloutHitAtPoint(doc, { x: 50, y: 30 })).toBeNull()
  })
})

describe('handleRects', () => {
  it('exposes four corners and four edge midpoints', () => {
    const handles = handleRects({ x: 100, y: 100, width: 200, height: 100 })
    expect(handles.map((h) => h.id)).toEqual([
      'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w',
    ])
  })

  it('centres each drawn handle on its anchor at HANDLE_SIZE across', () => {
    const handles = handleRects({ x: 100, y: 100, width: 200, height: 100 })
    const se = handles.find((h) => h.id === 'se')!
    expect(se.rect).toEqual({
      x: 300 - HANDLE_SIZE / 2,
      y: 200 - HANDLE_SIZE / 2,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    })
  })
})

describe('handleAtPoint', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 }

  it('finds the south-east handle', () => {
    expect(handleAtPoint(rect, { x: 300, y: 200 })).toBe('se')
  })

  it('returns null away from every handle', () => {
    expect(handleAtPoint(rect, { x: 200, y: 150 })).toBeNull()
  })

  it('catches a corner from outside the drawn handle', () => {
    const justOutsideDrawn = { x: 300 - HANDLE_SIZE, y: 200 - HANDLE_SIZE }
    const drawn = handleRects(rect).find((h) => h.id === 'se')!.rect
    expect(rectContains(drawn, justOutsideDrawn)).toBe(false)
    expect(handleAtPoint(rect, justOutsideDrawn)).toBe('se')
  })

  it('widens the grab area in image pixels as the image is zoomed out', () => {
    const point = { x: 285, y: 185 }
    expect(handleAtPoint(rect, point, 1)).toBeNull()
    expect(handleAtPoint(rect, point, 0.25)).toBe('se')
  })

  it('keeps the middle of a small frame draggable instead of all handle', () => {
    const small = { x: 0, y: 0, width: 60, height: 40 }
    expect(handleAtPoint(small, { x: 30, y: 20 }, 0.2)).toBeNull()
  })

  it('picks the corner, not the edge, where two grab areas overlap', () => {
    // Below the minimum grab size the corner and edge areas start to overlap.
    const tiny = { x: 0, y: 0, width: 12, height: 12 }
    expect(handleAtPoint(tiny, { x: 3, y: 0 })).toBe('nw')
  })
})

describe('resizeRect', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 }

  it('moves the south-east corner to the pointer', () => {
    expect(resizeRect(rect, 'se', { x: 400, y: 300 })).toEqual({
      x: 100, y: 100, width: 300, height: 200,
    })
  })

  it('moves the north-west corner and keeps the opposite corner fixed', () => {
    expect(resizeRect(rect, 'nw', { x: 50, y: 50 })).toEqual({
      x: 50, y: 50, width: 250, height: 150,
    })
  })

  it('normalizes when dragged past the opposite corner', () => {
    const flipped = resizeRect(rect, 'se', { x: 50, y: 50 })
    expect(flipped.width).toBeGreaterThanOrEqual(0)
    expect(flipped.height).toBeGreaterThanOrEqual(0)
  })

  it('resizes from the east edge keeping left anchored', () => {
    expect(resizeRect(rect, 'e', { x: 350, y: 150 })).toEqual({
      x: 100, y: 100, width: 250, height: 100,
    })
  })

  it('resizes from the north edge keeping bottom anchored', () => {
    expect(resizeRect(rect, 'n', { x: 200, y: 50 })).toEqual({
      x: 100, y: 50, width: 200, height: 150,
    })
  })
})

describe('moveAnnotation', () => {
  it('offsets a box rect', () => {
    const moved = moveAnnotation(box, 5, -5)
    expect(moved).toMatchObject({ rect: { x: 15, y: 5, width: 100, height: 50 } })
  })

  it('offsets both arrow endpoints', () => {
    expect(moveAnnotation(arrow, 10, 10)).toMatchObject({
      from: { x: 210, y: 210 }, to: { x: 110, y: 160 },
    })
  })

  it('moves a callout bubble and its tail together', () => {
    const callout: Annotation = {
      id: 'c', kind: 'callout',
      rect: { x: 100, y: 100, width: 200, height: 80 },
      tail: { x: 200, y: 260 },
      text: 'note', color: '#f00', fontSize: 18,
    }
    expect(moveAnnotation(callout, 10, -20)).toMatchObject({
      rect: { x: 110, y: 80, width: 200, height: 80 },
      tail: { x: 210, y: 240 },
    })
  })

  it('offsets a text anchor', () => {
    expect(moveAnnotation(text, -50, 0)).toMatchObject({ at: { x: 250, y: 300 } })
  })

  it('does not mutate the input', () => {
    moveAnnotation(box, 100, 100)
    expect(box.rect).toEqual({ x: 10, y: 10, width: 100, height: 50 })
  })
})
