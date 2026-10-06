import type { FontMeasurer } from './callout'
import {
  STEP_FONT_RATIO,
  STEP_MIN_SIZE,
  STEP_PIN_TIP_RATIO,
  STEP_TEXT_WIDTH_RATIO,
} from './constants'
import {
  type CaptureDocument,
  type StepAnnotation,
  type StepSequence,
  updateAnnotation,
} from './document'
import type { Point, Rect } from './geometry'
import type { ToolStyle } from './tools'

const ALPHABET_LENGTH = 26
const DIGITS = /^[1-9]\d*$/
const LOWER = /^[a-z]+$/
const UPPER = /^[A-Z]+$/

/**
 * The `index`th label of a sequence, counting from 1. Letters roll over like
 * spreadsheet columns, so step 27 is "aa" rather than running out.
 */
export function formatStepLabel(index: number, sequence: StepSequence): string {
  if (sequence === 'number') return String(index)
  const base = sequence === 'upper' ? 'A' : 'a'
  let remaining = index
  let label = ''
  while (remaining > 0) {
    const digit = (remaining - 1) % ALPHABET_LENGTH
    label = String.fromCharCode(base.charCodeAt(0) + digit) + label
    remaining = Math.floor((remaining - 1) / ALPHABET_LENGTH)
  }
  return label
}

/** Where a label sits in its sequence, or null when the user wrote something else. */
export function parseStepLabel(text: string, sequence: StepSequence): number | null {
  if (sequence === 'number') return DIGITS.test(text) ? Number(text) : null
  const pattern = sequence === 'upper' ? UPPER : LOWER
  if (!pattern.test(text)) return null
  const base = (sequence === 'upper' ? 'A' : 'a').charCodeAt(0)
  return [...text].reduce((total, char) => total * ALPHABET_LENGTH + char.charCodeAt(0) - base + 1, 0)
}

/**
 * The label a new step gets: one past the highest step of the same type
 * already placed. Worked out from the document rather than kept as a counter,
 * so undo, delete and rewriting a label all keep numbering consistent.
 */
export function nextStepLabel(doc: CaptureDocument, sequence: StepSequence): string {
  const highest = doc.annotations.reduce((max, annotation) => {
    if (annotation.kind !== 'step' || annotation.sequence !== sequence) return max
    return Math.max(max, parseStepLabel(annotation.text, sequence) ?? 0)
  }, 0)
  return formatStepLabel(highest + 1, sequence)
}

export function createStep(
  center: Point,
  style: ToolStyle,
  id: string,
  text: string,
): StepAnnotation {
  return {
    id,
    kind: 'step',
    center,
    size: style.stepSize,
    text,
    color: style.color,
    shape: style.stepShape,
    sequence: style.stepSequence,
  }
}

/** The square the badge itself fills, which is what the label centres in. */
export function stepBodyRect(step: StepAnnotation): Rect {
  const radius = step.size / 2
  return {
    x: step.center.x - radius,
    y: step.center.y - radius,
    width: step.size,
    height: step.size,
  }
}

/** Where a pin's point lands: to the right of the badge. */
export function stepPinTip(step: StepAnnotation): Point {
  return { x: step.center.x + (step.size / 2) * STEP_PIN_TIP_RATIO, y: step.center.y }
}

/** Everything the step paints, pin point included. */
export function stepBounds(step: StepAnnotation): Rect {
  const body = stepBodyRect(step)
  if (step.shape !== 'pin') return body
  return { ...body, width: stepPinTip(step).x - body.x }
}

/** Drags a corner to the pointer, growing the badge around its centre. */
export function resizeStep(step: StepAnnotation, point: Point): StepAnnotation {
  const reach = Math.max(Math.abs(point.x - step.center.x), Math.abs(point.y - step.center.y))
  return { ...step, size: Math.max(STEP_MIN_SIZE, reach * 2) }
}

/** Switches type, keeping the step's place: 3 becomes C. Custom labels stay as written. */
export function convertStepSequence(step: StepAnnotation, sequence: StepSequence): StepAnnotation {
  const index = parseStepLabel(step.text, step.sequence)
  return {
    ...step,
    sequence,
    text: index === null ? step.text : formatStepLabel(index, sequence),
  }
}

/** Rewrites one step's label inside a document. */
export function withStepText(doc: CaptureDocument, id: string, text: string): CaptureDocument {
  return updateAnnotation(doc, id, (annotation) =>
    annotation.kind === 'step' ? { ...annotation, text } : annotation,
  )
}

/** Blanks one step's label while the editing overlay draws it instead. */
export function hideStepText(doc: CaptureDocument, id: string): CaptureDocument {
  return withStepText(doc, id, '')
}

/**
 * The label's font size: a fixed share of the badge, shrunk only when a long
 * label would otherwise run past the edge.
 */
export function fitStepFontSize(step: StepAnnotation, measurerFor: FontMeasurer): number {
  const preferred = step.size * STEP_FONT_RATIO
  const width = measurerFor(preferred)(step.text)
  const room = step.size * STEP_TEXT_WIDTH_RATIO
  return width > room ? preferred * (room / width) : preferred
}
