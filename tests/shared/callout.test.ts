import { describe, expect, it } from 'vitest'
import {
  CALLOUT_DEFAULT_ASPECT,
  CALLOUT_DEFAULT_WIDTH_SHARE,
  CALLOUT_FONT_HEIGHT_RATIO,
  CALLOUT_LINE_HEIGHT_RATIO,
  CALLOUT_MIN_FONT_SIZE,
  CALLOUT_PADDING,
} from '@shared/constants'
import { addAnnotation, createDocument } from '@shared/document'
import {
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
  const tip = { x: 100, y: 200 }

  it('places the bubble beyond the release point and away from the fixed arrow tip', () => {
    expect(calloutRectFor(tip, { x: 180, y: 120 }, 160, 80)).toEqual({
      x: 180,
      y: 40,
      width: 160,
      height: 80,
    })
  })

  it('mirrors the bubble placement for every drag direction', () => {
    expect(calloutRectFor(tip, { x: 20, y: 120 }, 160, 80)).toEqual({
      x: -140, y: 40, width: 160, height: 80,
    })
    expect(calloutRectFor(tip, { x: 20, y: 280 }, 160, 80)).toEqual({
      x: -140, y: 280, width: 160, height: 80,
    })
    expect(calloutRectFor(tip, { x: 180, y: 280 }, 160, 80)).toEqual({
      x: 180, y: 280, width: 160, height: 80,
    })
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

describe('tailBase', () => {
  it('attaches to the nearest box edge as the arrow moves around it', () => {
    expect(tailBase(bubble, { x: 50, y: 140 })).toEqual({ x: 100, y: 140 })
    expect(tailBase(bubble, { x: 350, y: 140 })).toEqual({ x: 300, y: 140 })
    expect(tailBase(bubble, { x: 180, y: 40 })).toEqual({ x: 180, y: 100 })
    expect(tailBase(bubble, { x: 180, y: 240 })).toEqual({ x: 180, y: 180 })
  })

  it('uses the nearest corner when the arrow is diagonally outside the box', () => {
    expect(tailBase(bubble, { x: 40, y: 240 })).toEqual({ x: 100, y: 180 })
    expect(tailBase(bubble, { x: 360, y: 40 })).toEqual({ x: 300, y: 100 })
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
