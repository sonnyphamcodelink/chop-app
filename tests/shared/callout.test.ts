import { describe, expect, it } from 'vitest'
import { addAnnotation, createDocument } from '@shared/document'
import {
  calloutBadgeRect,
  defaultTailPoint,
  fitCalloutRect,
  hideCalloutText,
  readableTextColor,
  tailTriangle,
  updateCalloutText,
  wrapText,
} from '@shared/callout'
import type { Rect } from '@shared/geometry'

const bubble: Rect = { x: 100, y: 100, width: 200, height: 80 }

describe('defaultTailPoint', () => {
  it('sits below the bubble, centred on its width', () => {
    const tail = defaultTailPoint(bubble)
    expect(tail.x).toBe(200)
    expect(tail.y).toBeGreaterThan(bubble.y + bubble.height)
  })

  it('keeps a usable tail length for a very short bubble', () => {
    const tail = defaultTailPoint({ x: 0, y: 0, width: 100, height: 4 })
    expect(tail.y).toBeGreaterThan(20)
  })
})

describe('tailTriangle', () => {
  it('points its tip at the tail', () => {
    const [, tip] = tailTriangle(bubble, defaultTailPoint(bubble))
    expect(tip).toEqual(defaultTailPoint(bubble))
  })

  it('anchors its base on the bubble edge nearest the tail', () => {
    const [left, , right] = tailTriangle(bubble, { x: 200, y: 400 })
    expect(left.y).toBeCloseTo(bubble.y + bubble.height)
    expect(right.y).toBeCloseTo(bubble.y + bubble.height)
    expect(left.x).not.toBeCloseTo(right.x)
  })

  it('anchors on the side edge when the tail is off to one side', () => {
    const [left, , right] = tailTriangle(bubble, { x: 600, y: 140 })
    expect(left.x).toBeCloseTo(bubble.x + bubble.width)
    expect(right.x).toBeCloseTo(bubble.x + bubble.width)
  })

  it('degenerates without throwing when the tail is at the bubble centre', () => {
    const centre = { x: bubble.x + bubble.width / 2, y: bubble.y + bubble.height / 2 }
    expect(() => tailTriangle(bubble, centre)).not.toThrow()
  })
})

describe('fitCalloutRect', () => {
  /** One unit of width per character. */
  const measure = (text: string): number => text.length

  it('leaves a bubble that already fits its text alone', () => {
    const roomy = { x: 0, y: 0, width: 400, height: 200 }
    expect(fitCalloutRect(roomy, 'short note', 18, measure)).toBe(roomy)
  })

  it('grows downward when the text needs more lines than the bubble has room for', () => {
    const cramped = { x: 10, y: 20, width: 60, height: 20 }
    const fitted = fitCalloutRect(cramped, 'one two three four five six', 18, measure)
    expect(fitted.height).toBeGreaterThan(cramped.height)
    expect(fitted).toMatchObject({ x: 10, y: 20, width: 60 })
  })

  it('leaves an empty callout at its drawn size', () => {
    const rect = { x: 0, y: 0, width: 50, height: 10 }
    expect(fitCalloutRect(rect, '', 18, measure)).toBe(rect)
  })
})

describe('updateCalloutText', () => {
  const measure = (text: string): number => text.length
  const callout = {
    id: 'c', kind: 'callout' as const,
    rect: { x: 0, y: 0, width: 60, height: 200 },
    tail: { x: 30, y: 260 },
    text: 'before', color: '#ff3b30', fontSize: 18,
  }

  it('replaces the text and leaves a roomy bubble untouched', () => {
    expect(updateCalloutText(callout, 'after', measure)).toEqual({
      ...callout,
      text: 'after',
    })
  })

  it('grows the bubble and brings the tail with it when the note is longer', () => {
    const cramped = { ...callout, rect: { ...callout.rect, height: 20 } }
    const updated = updateCalloutText(cramped, 'one two three four five six', measure)
    expect(updated.rect.height).toBeGreaterThan(cramped.rect.height)
    expect(updated.tail.y).toBeGreaterThan(updated.rect.y + updated.rect.height)
  })

  it('does not mutate the callout it was given', () => {
    updateCalloutText(callout, 'something else entirely', measure)
    expect(callout.text).toBe('before')
  })
})

describe('calloutBadgeRect', () => {
  it('straddles the top-right corner of the bubble', () => {
    const badge = calloutBadgeRect(bubble, 1)
    expect(badge.x + badge.width / 2).toBe(bubble.x + bubble.width)
    expect(badge.y + badge.height / 2).toBe(bubble.y)
  })

  it('covers more image pixels as the image is zoomed out, staying constant on screen', () => {
    expect(calloutBadgeRect(bubble, 0.5).width).toBe(calloutBadgeRect(bubble, 1).width * 2)
  })

  it('treats a zero scale as 1:1 rather than dividing by it', () => {
    expect(calloutBadgeRect(bubble, 0).width).toBe(calloutBadgeRect(bubble, 1).width)
  })
})

describe('hideCalloutText', () => {
  const doc = addAnnotation(
    addAnnotation(createDocument('d', 800, 600), {
      id: 'other', kind: 'callout',
      rect: { x: 0, y: 0, width: 50, height: 20 },
      tail: { x: 25, y: 60 }, text: 'kept', color: '#f00', fontSize: 18,
    }),
    {
      id: 'edited', kind: 'callout',
      rect: bubble, tail: { x: 200, y: 260 }, text: 'typing', color: '#f00', fontSize: 18,
    },
  )

  it('blanks only the callout being typed into', () => {
    const hidden = hideCalloutText(doc, 'edited')
    expect(hidden.annotations).toMatchObject([{ text: 'kept' }, { text: '' }])
  })

  it('leaves the original document alone', () => {
    hideCalloutText(doc, 'edited')
    expect(doc.annotations[1]).toMatchObject({ text: 'typing' })
  })
})

describe('readableTextColor', () => {
  it('uses white on a dark fill', () => {
    expect(readableTextColor('#ff3b30')).toBe('#ffffff')
    expect(readableTextColor('#000000')).toBe('#ffffff')
  })

  it('uses black on a light fill', () => {
    expect(readableTextColor('#ffffff')).toBe('#000000')
    expect(readableTextColor('#ffcc00')).toBe('#000000')
  })

  it('accepts shorthand hex and falls back to white for anything else', () => {
    expect(readableTextColor('#fff')).toBe('#000000')
    expect(readableTextColor('rebeccapurple')).toBe('#ffffff')
  })
})

describe('wrapText', () => {
  /** One unit of width per character, so expectations read as character counts. */
  const measure = (text: string): number => text.length

  it('returns no lines for empty text', () => {
    expect(wrapText('', 10, measure)).toEqual([])
    expect(wrapText('   ', 10, measure)).toEqual([])
  })

  it('keeps text on one line when it fits', () => {
    expect(wrapText('hello there', 20, measure)).toEqual(['hello there'])
  })

  it('breaks greedily at word boundaries', () => {
    expect(wrapText('one two three four', 9, measure)).toEqual(['one two', 'three', 'four'])
  })

  it('gives a word longer than the line its own line rather than dropping it', () => {
    expect(wrapText('hi supercalifragilistic', 5, measure)).toEqual([
      'hi',
      'supercalifragilistic',
    ])
  })
})
