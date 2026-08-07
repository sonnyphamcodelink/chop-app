import { describe, expect, it } from 'vitest'
import {
  CALLOUT_DEFAULT_ASPECT,
  CALLOUT_DEFAULT_WIDTH_SHARE,
  CALLOUT_FONT_HEIGHT_RATIO,
  CALLOUT_LINE_HEIGHT_RATIO,
  CALLOUT_MIN_FONT_SIZE,
  CALLOUT_MIN_TAIL_LENGTH,
  CALLOUT_PADDING,
} from '@shared/constants'
import { addAnnotation, createDocument } from '@shared/document'
import {
  calloutBadgeRect,
  calloutFontSizeFor,
  calloutHeightForFontSize,
  calloutRectFor,
  calloutTextWidth,
  defaultCalloutSize,
  fitCalloutFontSize,
  fitCalloutRect,
  hideCalloutText,
  readableTextColor,
  tailBase,
  tailTriangle,
  updateCalloutText,
  wrapText,
} from '@shared/callout'
import type { Rect } from '@shared/geometry'

const bubble: Rect = { x: 100, y: 100, width: 200, height: 80 }

const LONG_NOTE =
  'this note is long enough that it has to wrap across several lines to fit'

/**
 * Stands in for canvas text metrics: half the font size per character, which is
 * about right for a sans-serif face and keeps expectations easy to reason about.
 */
const measurerFor = (fontSize: number) => (text: string) => text.length * fontSize * 0.5

/** Height the wrapped note needs at `fontSize`, for asserting that it fits. */
function wrappedHeight(rect: Rect, text: string, fontSize: number): number {
  const lines = wrapText(text, calloutTextWidth(rect.width), measurerFor(fontSize))
  return lines.length * fontSize * CALLOUT_LINE_HEIGHT_RATIO + CALLOUT_PADDING * 2
}

describe('calloutRectFor', () => {
  const tip = { x: 200, y: 300 }

  it('hangs the bubble above the release point, tail base under the pointer', () => {
    const rect = calloutRectFor(tip, { x: 260, y: 200 }, 160, 80)
    const [left, right] = tailBase(rect)
    expect((left.x + right.x) / 2).toBeCloseTo(260)
    expect(rect.y + rect.height).toBe(200)
    expect(rect).toMatchObject({ width: 160, height: 80 })
  })

  it('lifts a bubble released level with its target clear of it, so the tail shows', () => {
    const rect = calloutRectFor(tip, { x: 400, y: 300 }, 160, 80)
    expect(rect.y + rect.height).toBe(tip.y - CALLOUT_MIN_TAIL_LENGTH)
  })

  it('keeps the bubble above the target even when released below it', () => {
    const rect = calloutRectFor(tip, { x: 400, y: 500 }, 160, 80)
    expect(rect.y + rect.height).toBeLessThan(tip.y)
    // The pointer still decides which way along the capture the note sits.
    expect(rect.x).toBeGreaterThan(tip.x)
  })
})

describe('defaultCalloutSize', () => {
  it('takes its share of the capture, in caption proportions', () => {
    const size = defaultCalloutSize({ width: 2000, height: 1200 }, 18)
    expect(size.width).toBeCloseTo(2000 * CALLOUT_DEFAULT_WIDTH_SHARE)
    expect(size.width / size.height).toBeCloseTo(CALLOUT_DEFAULT_ASPECT, 1)
  })

  it('grows with the capture, so one note reads the same at any resolution', () => {
    const small = defaultCalloutSize({ width: 1000, height: 600 }, 18)
    const large = defaultCalloutSize({ width: 4000, height: 2400 }, 18)
    expect(large.width).toBeCloseTo(small.width * 4)
  })

  it('stays deep enough for a line of text on a capture too small for the aspect', () => {
    const size = defaultCalloutSize({ width: 320, height: 240 }, 18)
    expect(size.height).toBe(calloutHeightForFontSize(18))
    expect(calloutFontSizeFor({ x: 0, y: 0, ...size })).toBe(18)
  })
})

describe('calloutHeightForFontSize', () => {
  it('inverts calloutFontSizeFor, so a default bubble writes at the size asked for', () => {
    for (const fontSize of [12, 18, 32]) {
      const height = calloutHeightForFontSize(fontSize)
      expect(calloutFontSizeFor({ x: 0, y: 0, width: 200, height })).toBe(fontSize)
    }
  })
})

describe('tailTriangle', () => {
  const bottom = bubble.y + bubble.height

  it('points its tip at the tail', () => {
    const [, tip] = tailTriangle(bubble, { x: 132, y: 220 })
    expect(tip).toEqual({ x: 132, y: 220 })
  })

  it('sits flush on the bottom edge, left of centre', () => {
    const [left, , right] = tailTriangle(bubble, { x: 200, y: 400 })
    expect(left.y).toBe(bottom)
    expect(right.y).toBe(bottom)
    expect(left.x).toBeGreaterThanOrEqual(bubble.x)
    expect(right.x).toBeLessThan(bubble.x + bubble.width / 2)
  })

  it('keeps the base put and only stretches, wherever the tip is', () => {
    const [farLeft, , farRight] = tailTriangle(bubble, { x: -400, y: 400 })
    const [nearLeft, , nearRight] = tailTriangle(bubble, { x: 600, y: 190 })
    expect(farLeft).toEqual(nearLeft)
    expect(farRight).toEqual(nearRight)
  })

  it('collapses onto the edge rather than pointing back through the bubble', () => {
    const [, tip] = tailTriangle(bubble, { x: 220, y: 20 })
    expect(tip).toEqual({ x: 220, y: bottom })
  })

  it('keeps the base inside a bubble narrower than the usual inset', () => {
    const narrow = { x: 0, y: 0, width: 12, height: 20 }
    const [left, , right] = tailTriangle(narrow, { x: 6, y: 60 })
    expect(left.x).toBeGreaterThanOrEqual(narrow.x)
    expect(right.x).toBeLessThanOrEqual(narrow.x + narrow.width)
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

describe('calloutFontSizeFor', () => {
  it('gives one line its share of the bubble\u2019s usable height', () => {
    const rect = { x: 0, y: 0, width: 400, height: 200 }
    const usable = rect.height - CALLOUT_PADDING * 2
    const line = calloutFontSizeFor(rect) * CALLOUT_LINE_HEIGHT_RATIO
    expect(line / usable).toBeCloseTo(CALLOUT_FONT_HEIGHT_RATIO, 1)
  })

  it('scales with the bubble, down to a readable floor', () => {
    expect(calloutFontSizeFor({ x: 0, y: 0, width: 400, height: 400 })).toBeGreaterThan(
      calloutFontSizeFor({ x: 0, y: 0, width: 400, height: 200 }),
    )
    expect(calloutFontSizeFor({ x: 0, y: 0, width: 40, height: 10 })).toBe(
      CALLOUT_MIN_FONT_SIZE,
    )
  })
})

describe('fitCalloutFontSize', () => {
  it('gives a roomy bubble big text', () => {
    const roomy = { x: 0, y: 0, width: 400, height: 200 }
    const fitted = fitCalloutFontSize(roomy, 'note', measurerFor)
    // One short line: the height, not the width, is what limits it.
    expect(fitted).toBe(calloutFontSizeFor(roomy))
    expect(fitted).toBeGreaterThan(CALLOUT_MIN_FONT_SIZE * 4)
  })

  it('gives a taller bubble bigger text than a short one', () => {
    const short = { x: 0, y: 0, width: 400, height: 60 }
    const tall = { x: 0, y: 0, width: 400, height: 240 }
    expect(fitCalloutFontSize(tall, 'a note', measurerFor)).toBeGreaterThan(
      fitCalloutFontSize(short, 'a note', measurerFor),
    )
  })

  it('shrinks the text so a long note still fits', () => {
    const rect = { x: 0, y: 0, width: 300, height: 120 }
    const short = fitCalloutFontSize(rect, 'hi', measurerFor)
    const long = fitCalloutFontSize(rect, LONG_NOTE, measurerFor)
    expect(long).toBeLessThan(short)
    expect(wrappedHeight(rect, LONG_NOTE, long)).toBeLessThanOrEqual(rect.height)
  })

  it('never goes below the readable minimum', () => {
    const tiny = { x: 0, y: 0, width: 40, height: 30 }
    expect(fitCalloutFontSize(tiny, LONG_NOTE, measurerFor)).toBe(CALLOUT_MIN_FONT_SIZE)
  })

  it('fills the height for an empty bubble, so the first keystroke is big', () => {
    const rect = { x: 0, y: 0, width: 200, height: 100 }
    expect(fitCalloutFontSize(rect, '', measurerFor)).toBe(calloutFontSizeFor(rect))
  })
})

describe('updateCalloutText', () => {
  const callout = {
    id: 'c', kind: 'callout' as const,
    rect: { x: 0, y: 0, width: 300, height: 120 },
    tail: { x: 150, y: 180 },
    text: 'before', color: '#ff3b30', fontSize: 40,
  }

  it('replaces the text and re-sizes it to the bubble', () => {
    const updated = updateCalloutText(callout, 'after', measurerFor)
    expect(updated.text).toBe('after')
    expect(updated.fontSize).toBe(fitCalloutFontSize(callout.rect, 'after', measurerFor))
  })

  it('shrinks the text rather than the bubble when the note grows', () => {
    const updated = updateCalloutText(callout, LONG_NOTE, measurerFor)
    expect(updated.fontSize).toBeLessThan(
      fitCalloutFontSize(callout.rect, 'before', measurerFor),
    )
    expect(updated.rect).toEqual(callout.rect)
  })

  it('grows the bubble only once the text has hit its minimum size', () => {
    const cramped = { ...callout, rect: { x: 0, y: 0, width: 40, height: 20 } }
    const updated = updateCalloutText(cramped, LONG_NOTE, measurerFor)
    expect(updated.fontSize).toBe(CALLOUT_MIN_FONT_SIZE)
    expect(updated.rect.height).toBeGreaterThan(cramped.rect.height)
  })

  it('leaves the tail tip on whatever the note points at', () => {
    const aimed = { ...callout, tail: { x: 500, y: 20 } }
    expect(updateCalloutText(aimed, 'after', measurerFor).tail).toEqual({ x: 500, y: 20 })
  })

  it('does not mutate the callout it was given', () => {
    updateCalloutText(callout, 'something else entirely', measurerFor)
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
