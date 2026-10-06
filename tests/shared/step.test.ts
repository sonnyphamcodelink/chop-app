import { describe, expect, it } from 'vitest'
import { STEP_MIN_SIZE } from '@shared/constants'
import { addAnnotation, createDocument, type StepAnnotation } from '@shared/document'
import {
  convertStepSequence,
  createStep,
  fitStepFontSize,
  formatStepLabel,
  hideStepText,
  nextStepLabel,
  parseStepLabel,
  resizeStep,
  stepBodyRect,
  stepBounds,
  withStepText,
} from '@shared/step'
import { defaultStyle } from '@shared/tools'

function step(overrides: Partial<StepAnnotation> = {}): StepAnnotation {
  return {
    id: 's', kind: 'step',
    center: { x: 100, y: 100 }, size: 40,
    text: '1', color: '#e5484d', shape: 'circle', sequence: 'number',
    ...overrides,
  }
}

describe('formatStepLabel', () => {
  it('counts in digits for numbers', () => {
    expect([1, 2, 10].map((n) => formatStepLabel(n, 'number'))).toEqual(['1', '2', '10'])
  })

  it('counts in letters, rolling over after z like spreadsheet columns', () => {
    expect([1, 2, 26, 27, 28].map((n) => formatStepLabel(n, 'lower')))
      .toEqual(['a', 'b', 'z', 'aa', 'ab'])
    expect(formatStepLabel(3, 'upper')).toBe('C')
  })
})

describe('parseStepLabel', () => {
  it('reads back what formatStepLabel writes', () => {
    for (const sequence of ['number', 'lower', 'upper'] as const) {
      for (const n of [1, 5, 26, 27, 53]) {
        expect(parseStepLabel(formatStepLabel(n, sequence), sequence)).toBe(n)
      }
    }
  })

  it('returns null for labels that are not part of the sequence', () => {
    expect(parseStepLabel('A', 'number')).toBeNull()
    expect(parseStepLabel('7', 'upper')).toBeNull()
    expect(parseStepLabel('a', 'upper')).toBeNull()
    expect(parseStepLabel('Note', 'number')).toBeNull()
    expect(parseStepLabel('0', 'number')).toBeNull()
  })
})

describe('nextStepLabel', () => {
  it('starts each sequence at its first label', () => {
    const doc = createDocument('d', 800, 600)
    expect(nextStepLabel(doc, 'number')).toBe('1')
    expect(nextStepLabel(doc, 'lower')).toBe('a')
    expect(nextStepLabel(doc, 'upper')).toBe('A')
  })

  it('continues after the highest label of the same sequence', () => {
    const doc = [
      step({ id: 'a', text: '1' }),
      step({ id: 'b', text: '4' }),
      step({ id: 'c', text: '2' }),
      step({ id: 'd', text: 'B', sequence: 'upper' }),
    ].reduce(addAnnotation, createDocument('d', 800, 600))
    expect(nextStepLabel(doc, 'number')).toBe('5')
    expect(nextStepLabel(doc, 'upper')).toBe('C')
    expect(nextStepLabel(doc, 'lower')).toBe('a')
  })

  it('ignores labels the user rewrote to something outside the sequence', () => {
    const doc = addAnnotation(createDocument('d', 800, 600), step({ text: 'Start' }))
    expect(nextStepLabel(doc, 'number')).toBe('1')
  })
})

describe('createStep', () => {
  it('takes colour, shape, type and size from the tool style', () => {
    const style = { ...defaultStyle(), color: '#4fb264', stepShape: 'pin', stepSequence: 'upper', stepSize: 50 } as const
    expect(createStep({ x: 5, y: 6 }, style, 'id', 'C')).toEqual({
      id: 'id', kind: 'step', center: { x: 5, y: 6 }, size: 50,
      text: 'C', color: '#4fb264', shape: 'pin', sequence: 'upper',
    })
  })
})

describe('stepBodyRect / stepBounds', () => {
  it('is the square around the badge', () => {
    expect(stepBodyRect(step())).toEqual({ x: 80, y: 80, width: 40, height: 40 })
  })

  it('reaches out to the tip for a pin', () => {
    const bounds = stepBounds(step({ shape: 'pin' }))
    expect(bounds.x).toBe(80)
    expect(bounds.x + bounds.width).toBeGreaterThan(120)
    expect(bounds.height).toBe(40)
  })

  it('is the body itself for round and square badges', () => {
    expect(stepBounds(step({ shape: 'square' }))).toEqual(stepBodyRect(step()))
  })
})

describe('resizeStep', () => {
  it('grows around the centre so the badge stays on its target', () => {
    const resized = resizeStep(step(), { x: 130, y: 110 })
    expect(resized.center).toEqual({ x: 100, y: 100 })
    expect(resized.size).toBe(60)
  })

  it('never shrinks below the minimum size', () => {
    expect(resizeStep(step(), { x: 100, y: 100 }).size).toBe(STEP_MIN_SIZE)
  })
})

describe('convertStepSequence', () => {
  it('keeps the position in the sequence when switching type', () => {
    expect(convertStepSequence(step({ text: '3' }), 'upper')).toMatchObject({ text: 'C', sequence: 'upper' })
    expect(convertStepSequence(step({ text: 'b', sequence: 'lower' }), 'number')).toMatchObject({ text: '2' })
  })

  it('leaves a custom label alone', () => {
    expect(convertStepSequence(step({ text: 'Go' }), 'lower')).toMatchObject({ text: 'Go', sequence: 'lower' })
  })
})

describe('withStepText / hideStepText', () => {
  const doc = [step({ id: 'a', text: '1' }), step({ id: 'b', text: '2' })]
    .reduce(addAnnotation, createDocument('d', 800, 600))

  it('rewrites one step label', () => {
    expect(withStepText(doc, 'b', '1').annotations).toMatchObject([{ text: '1' }, { text: '1' }])
  })

  it('blanks only the step being typed into, leaving the original alone', () => {
    expect(hideStepText(doc, 'a').annotations).toMatchObject([{ text: '' }, { text: '2' }])
    expect(doc.annotations[0]).toMatchObject({ text: '1' })
  })
})

describe('fitStepFontSize', () => {
  // One unit of width per character per pixel of font size.
  const measurer = (fontSize: number) => (text: string) => text.length * fontSize * 0.6

  it('uses the full badge font for a short label', () => {
    const short = fitStepFontSize(step({ text: '1' }), measurer)
    const long = fitStepFontSize(step({ text: '1234' }), measurer)
    expect(short).toBeGreaterThan(long)
  })

  it('shrinks a long label until it fits inside the badge', () => {
    const target = step({ text: '12345' })
    const size = fitStepFontSize(target, measurer)
    expect(measurer(size)(target.text)).toBeLessThanOrEqual(target.size)
  })
})
