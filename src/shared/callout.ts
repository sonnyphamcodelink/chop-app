import {
  CALLOUT_BADGE_SIZE,
  CALLOUT_DEFAULT_ASPECT,
  CALLOUT_DEFAULT_WIDTH_SHARE,
  CALLOUT_FONT_HEIGHT_RATIO,
  CALLOUT_LINE_HEIGHT_RATIO,
  CALLOUT_MIN_FONT_SIZE,
  CALLOUT_MIN_TAIL_LENGTH,
  CALLOUT_MIN_TAIL_WIDTH,
  CALLOUT_PADDING,
  CALLOUT_TAIL_INSET,
  CALLOUT_TAIL_WIDTH_RATIO,
} from './constants'
import { type CalloutAnnotation, type CaptureDocument, updateAnnotation } from './document'
import { type Point, type Rect, rectsEqual, type Size } from './geometry'

/** Width available for text inside a bubble of this width. */
export function calloutTextWidth(rectWidth: number): number {
  return Math.max(1, rectWidth - CALLOUT_PADDING * 2)
}

/** Bubble edge point, tail tip, bubble edge point. */
export type TailTriangle = readonly [Point, Point, Point]

/**
 * The footprint the tail leaves the bubble from: a fixed span on the bottom
 * edge, near the left corner. Sitting on the edge itself is what keeps the tail
 * and the bubble flush, whichever way the tail happens to point.
 */
export function tailBase(rect: Rect): readonly [Point, Point] {
  const width = Math.min(
    Math.max(CALLOUT_MIN_TAIL_WIDTH, rect.width * CALLOUT_TAIL_WIDTH_RATIO),
    rect.width,
  )
  const inset = Math.min(CALLOUT_TAIL_INSET, rect.width - width)
  const bottom = rect.y + rect.height
  return [
    { x: rect.x + inset, y: bottom },
    { x: rect.x + inset + width, y: bottom },
  ]
}

/** The tip as drawn: never above the bottom edge, where it would point back through the bubble. */
export function tailTip(rect: Rect, tail: Point): Point {
  return { x: tail.x, y: Math.max(tail.y, rect.y + rect.height) }
}

/**
 * Where a bubble of this size goes for a callout aimed at `tip` and let go at
 * `at`: tail base under the pointer, bubble hanging above it. Never level with
 * or below the target, since the tail leaves the bottom edge and would have
 * nowhere to go.
 */
export function calloutRectFor(tip: Point, at: Point, width: number, height: number): Rect {
  const [left, right] = tailBase({ x: 0, y: 0, width, height })
  const baseCentre = (left.x + right.x) / 2
  const bottom = Math.min(at.y, tip.y - CALLOUT_MIN_TAIL_LENGTH)
  return { x: at.x - baseCentre, y: bottom - height, width, height }
}

/**
 * The tail as a triangle: a base on the bubble's bottom-left edge and a tip at
 * the target. Filled in the bubble colour, it reads as one shape. The tip is
 * anchored to what the note points at, so moving the bubble stretches the tail
 * rather than dragging the target along with it.
 */
export function tailTriangle(rect: Rect, tail: Point): TailTriangle {
  const [left, right] = tailBase(rect)
  return [left, tailTip(rect, tail), right]
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

/**
 * The largest single line the bubble allows: the ceiling for auto-sizing. Only
 * a share of the height, so a big bubble gets bigger text without the note
 * swelling to fill it.
 */
export function calloutFontSizeFor(rect: Rect): number {
  const usable = (rect.height - CALLOUT_PADDING * 2) * CALLOUT_FONT_HEIGHT_RATIO
  // Nudged before flooring: a height built back from a font size lands a hair
  // under it in binary, which would otherwise cost a whole pixel.
  const fitted = Math.floor(usable / CALLOUT_LINE_HEIGHT_RATIO + 1e-9)
  return Math.max(CALLOUT_MIN_FONT_SIZE, fitted)
}

/**
 * Inverse of `calloutFontSizeFor`: the bubble height one line of `fontSize`
 * needs. Derived rather than tuned, so a change to the fitting rules carries
 * straight through to bubbles nobody sized by hand.
 */
export function calloutHeightForFontSize(fontSize: number): number {
  return (fontSize * CALLOUT_LINE_HEIGHT_RATIO) / CALLOUT_FONT_HEIGHT_RATIO + CALLOUT_PADDING * 2
}

/**
 * The bubble a callout gets when nobody sized it: a caption-shaped band across
 * a third of the capture, big enough to type a note into without reaching for
 * the handles first. Never shallower than one line at `fontSize`, since on a
 * small capture the padding alone would swallow the aspect-derived height.
 */
export function defaultCalloutSize(view: Size, fontSize: number): Size {
  const width = view.width * CALLOUT_DEFAULT_WIDTH_SHARE
  return {
    width,
    height: Math.max(width / CALLOUT_DEFAULT_ASPECT, calloutHeightForFontSize(fontSize)),
  }
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
 * the smallest readable text will not fit. The tail tip stays put: it marks
 * what the note points at, not part of the bubble.
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
