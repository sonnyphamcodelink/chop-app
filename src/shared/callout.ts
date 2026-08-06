import {
  CALLOUT_BADGE_SIZE,
  CALLOUT_LINE_HEIGHT_RATIO,
  CALLOUT_MIN_TAIL_LENGTH,
  CALLOUT_MIN_TAIL_WIDTH,
  CALLOUT_PADDING,
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
 * Grows a bubble downwards until its wrapped text fits. The drag sets the width
 * and a minimum height; the text decides the rest, so a note is never cut off.
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

/**
 * Rewrites a callout's note. The bubble grows if the new text needs the room,
 * and the tail follows the bottom edge when it does.
 */
export function updateCalloutText(
  callout: CalloutAnnotation,
  text: string,
  measure: (text: string) => number,
): CalloutAnnotation {
  const rect = fitCalloutRect(callout.rect, text, callout.fontSize, measure)
  if (rectsEqual(rect, callout.rect)) return { ...callout, text }
  return { ...callout, text, rect, tail: defaultTailPoint(rect) }
}

/** Rewrites one callout's note inside a document, leaving the rest untouched. */
export function withCalloutText(
  doc: CaptureDocument,
  id: string,
  text: string,
  measure: (text: string) => number,
): CaptureDocument {
  return updateAnnotation(doc, id, (annotation) =>
    annotation.kind === 'callout' ? updateCalloutText(annotation, text, measure) : annotation,
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
