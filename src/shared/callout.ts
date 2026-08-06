import {
  CALLOUT_BADGE_SIZE,
  CALLOUT_LINE_HEIGHT_RATIO,
  CALLOUT_MIN_FONT_SIZE,
  CALLOUT_MIN_TAIL_LENGTH,
  CALLOUT_MIN_TAIL_WIDTH,
  CALLOUT_PADDING,
  CALLOUT_TAIL_HANDLE_SIZE,
  CALLOUT_TAIL_LENGTH_RATIO,
  CALLOUT_TAIL_WIDTH_RATIO,
} from './constants'
import { type CalloutAnnotation, type CaptureDocument, updateAnnotation } from './document'
import { type Point, type Rect, rectsEqual } from './geometry'

/** Width available for text inside a bubble of this width. */
export function calloutTextWidth(rectWidth: number): number {
  return Math.max(1, rectWidth - CALLOUT_PADDING * 2)
}

/** Bubble edge point, tail tip, bubble edge point. */
export type TailTriangle = readonly [Point, Point, Point]

/** Where a new callout points: straight down, so the bubble sits above its target. */
export function defaultTailPoint(rect: Rect): Point {
  const drop = Math.max(CALLOUT_MIN_TAIL_LENGTH, rect.height * CALLOUT_TAIL_LENGTH_RATIO)
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height + drop }
}

/** Where the ray from the bubble centre towards `tail` leaves the bubble. */
function edgePoint(rect: Rect, tail: Point): Point {
  const centre = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const dx = tail.x - centre.x
  const dy = tail.y - centre.y
  if (dx === 0 && dy === 0) return centre

  // Grow the direction until it meets whichever pair of edges it reaches first.
  const toVertical = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx)
  const toHorizontal = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy)
  const t = Math.min(toVertical, toHorizontal)
  return { x: centre.x + dx * t, y: centre.y + dy * t }
}

/**
 * The tail as a triangle: a base spanning the bubble edge facing the target and
 * a tip at the target. Filled in the bubble colour, it reads as one shape.
 */
export function tailTriangle(rect: Rect, tail: Point): TailTriangle {
  const base = edgePoint(rect, tail)
  const dx = tail.x - base.x
  const dy = tail.y - base.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return [base, tail, base]

  const halfWidth =
    Math.max(
      CALLOUT_MIN_TAIL_WIDTH,
      Math.min(rect.width, rect.height) * CALLOUT_TAIL_WIDTH_RATIO,
    ) / 2
  // Perpendicular to the tail direction, so the base always faces the tip.
  const offsetX = (-dy / length) * halfWidth
  const offsetY = (dx / length) * halfWidth
  return [
    { x: base.x + offsetX, y: base.y + offsetY },
    tail,
    { x: base.x - offsetX, y: base.y - offsetY },
  ]
}

/**
 * Grows a bubble downwards until its wrapped text fits. Only reached once the
 * text has already been shrunk to the minimum readable size.
 */
export function fitCalloutRect(
  rect: Rect,
  text: string,
  fontSize: number,
  measure: (text: string) => number,
): Rect {
  const lines = wrapText(text, calloutTextWidth(rect.width), measure)
  if (lines.length === 0) return rect
  const needed = lines.length * fontSize * CALLOUT_LINE_HEIGHT_RATIO + CALLOUT_PADDING * 2
  return needed <= rect.height ? rect : { ...rect, height: needed }
}

/** Measures text at a given font size. Injected so fitting stays testable. */
export type FontMeasurer = (fontSize: number) => (text: string) => number

/** The tallest single line that fits the bubble: the ceiling for auto-sizing. */
export function calloutFontSizeFor(rect: Rect): number {
  const usable = rect.height - CALLOUT_PADDING * 2
  return Math.max(CALLOUT_MIN_FONT_SIZE, Math.floor(usable / CALLOUT_LINE_HEIGHT_RATIO))
}

/**
 * The largest font whose wrapped text still fits the bubble. Callout text is
 * sized by the bubble rather than by the toolbar, so a note drawn large reads
 * large. Fitting is monotonic in font size, so this bisects rather than counts
 * down: a resize refits on every frame of the drag.
 */
export function fitCalloutFontSize(
  rect: Rect,
  text: string,
  measurerFor: FontMeasurer,
): number {
  const ceiling = calloutFontSizeFor(rect)
  if (!text.trim()) return ceiling

  const maxWidth = calloutTextWidth(rect.width)
  const maxHeight = rect.height - CALLOUT_PADDING * 2
  const fits = (size: number): boolean => {
    const lines = wrapText(text, maxWidth, measurerFor(size))
    return lines.length * size * CALLOUT_LINE_HEIGHT_RATIO <= maxHeight
  }

  let low = CALLOUT_MIN_FONT_SIZE
  let high = ceiling
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (fits(middle)) low = middle
    else high = middle - 1
  }
  return low
}

/**
 * Re-sizes a callout's text to its bubble, growing the bubble only when even
 * the smallest readable text will not fit. The tail is left where it is: it may
 * have been aimed by hand.
 */
export function refitCallout(
  callout: CalloutAnnotation,
  measurerFor: FontMeasurer,
): CalloutAnnotation {
  const fontSize = fitCalloutFontSize(callout.rect, callout.text, measurerFor)
  const rect = fitCalloutRect(callout.rect, callout.text, fontSize, measurerFor(fontSize))
  if (fontSize === callout.fontSize && rectsEqual(rect, callout.rect)) return callout
  return { ...callout, fontSize, rect }
}

/** Rewrites a callout's note, then re-sizes the text to the bubble. */
export function updateCalloutText(
  callout: CalloutAnnotation,
  text: string,
  measurerFor: FontMeasurer,
): CalloutAnnotation {
  return refitCallout({ ...callout, text }, measurerFor)
}

/** Rewrites one callout's note inside a document, leaving the rest untouched. */
export function withCalloutText(
  doc: CaptureDocument,
  id: string,
  text: string,
  measurerFor: FontMeasurer,
): CaptureDocument {
  return updateAnnotation(doc, id, (annotation) =>
    annotation.kind === 'callout' ? updateCalloutText(annotation, text, measurerFor) : annotation,
  )
}

/**
 * The delete badge, straddling the bubble's top-right corner. `scale` is CSS
 * pixels per image pixel, so the badge stays the same size however far the
 * image is zoomed. Editor chrome only: it is never part of the exported image.
 */
export function calloutBadgeRect(rect: Rect, scale: number): Rect {
  const size = CALLOUT_BADGE_SIZE / (scale > 0 ? scale : 1)
  return {
    x: rect.x + rect.width - size / 2,
    y: rect.y - size / 2,
    width: size,
    height: size,
  }
}

/** Grab area for the round handle that aims the tail, centred on its tip. */
export function calloutTailHandleRect(tail: Point, scale: number): Rect {
  const size = CALLOUT_TAIL_HANDLE_SIZE / (scale > 0 ? scale : 1)
  return { x: tail.x - size / 2, y: tail.y - size / 2, width: size, height: size }
}

/**
 * Blanks one callout's text. While a note is being typed, the live text belongs
 * to the editing overlay; painting it on the canvas as well would double it.
 */
export function hideCalloutText(doc: CaptureDocument, id: string): CaptureDocument {
  return updateAnnotation(doc, id, (annotation) =>
    annotation.kind === 'callout' ? { ...annotation, text: '' } : annotation,
  )
}

const SHORTHAND_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const FULL_HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

function parseHex(color: string): readonly [number, number, number] | null {
  const shorthand = SHORTHAND_HEX.exec(color)
  if (shorthand) {
    const [, r, g, b] = shorthand
    return [
      Number.parseInt(`${r}${r}`, 16),
      Number.parseInt(`${g}${g}`, 16),
      Number.parseInt(`${b}${b}`, 16),
    ]
  }
  const full = FULL_HEX.exec(color)
  if (!full) return null
  const [, r, g, b] = full
  return [
    Number.parseInt(r!, 16),
    Number.parseInt(g!, 16),
    Number.parseInt(b!, 16),
  ]
}

/** Perceived-brightness cutoff above which black text reads better than white. */
const LIGHT_FILL_LUMINANCE = 0.6

/**
 * Callout text is drawn on the bubble fill, so it picks its own colour: the
 * white and yellow swatches would otherwise leave white text invisible.
 */
export function readableTextColor(background: string): string {
  const rgb = parseHex(background)
  if (!rgb) return '#ffffff'
  const [r, g, b] = rgb
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > LIGHT_FILL_LUMINANCE ? '#000000' : '#ffffff'
}

/**
 * Greedy word wrap. `measure` reports rendered width, so the caller decides the
 * font. A word wider than the line keeps its own line rather than being dropped.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): readonly string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && measure(candidate) > maxWidth) {
      lines.push(line)
      line = word
      continue
    }
    line = candidate
  }
  lines.push(line)
  return lines
}
