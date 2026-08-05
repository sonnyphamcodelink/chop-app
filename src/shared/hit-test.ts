import { HANDLE_HIT_SIZE, HANDLE_SIZE } from './constants'
import type { Annotation, CaptureDocument } from './document'
import {
  normalizeRect,
  offsetRect,
  type Point,
  type Rect,
  rectContains,
} from './geometry'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** Rough per-character width as a fraction of font size, for text bounds. */
const TEXT_WIDTH_RATIO = 0.6
const TEXT_HEIGHT_RATIO = 1.25

export function annotationBounds(annotation: Annotation): Rect {
  switch (annotation.kind) {
    case 'box':
    case 'highlight':
    case 'blur':
      return annotation.rect
    case 'arrow':
      return normalizeRect(annotation.from, annotation.to)
    case 'text':
      return {
        x: annotation.at.x,
        y: annotation.at.y,
        width: Math.max(
          annotation.fontSize,
          annotation.text.length * annotation.fontSize * TEXT_WIDTH_RATIO,
        ),
        height: annotation.fontSize * TEXT_HEIGHT_RATIO,
      }
  }
}

/** Front-most annotation containing the point, or null. */
export function annotationAtPoint(
  doc: CaptureDocument,
  point: Point,
): Annotation | null {
  for (let index = doc.annotations.length - 1; index >= 0; index -= 1) {
    const annotation = doc.annotations[index]!
    if (rectContains(annotationBounds(annotation), point)) return annotation
  }
  return null
}

const DRAW_ORDER: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Corners first, so they win wherever a corner and an edge grab area overlap. */
const HIT_ORDER: readonly HandleId[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w']

/** No more than a third of an edge may be grab area, or a small frame is all handle. */
const MAX_HIT_FRACTION = 1 / 3

function handleAnchors(rect: Rect): Readonly<Record<HandleId, Point>> {
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return {
    nw: { x: rect.x, y: rect.y },
    n: { x: midX, y: rect.y },
    ne: { x: right, y: rect.y },
    e: { x: right, y: midY },
    se: { x: right, y: bottom },
    s: { x: midX, y: bottom },
    sw: { x: rect.x, y: bottom },
    w: { x: rect.x, y: midY },
  }
}

function squareAt(center: Point, size: number): Rect {
  return { x: center.x - size / 2, y: center.y - size / 2, width: size, height: size }
}

export function handleRects(
  rect: Rect,
): readonly { readonly id: HandleId; readonly rect: Rect }[] {
  const anchors = handleAnchors(rect)
  return DRAW_ORDER.map((id) => ({ id, rect: squareAt(anchors[id], HANDLE_SIZE) }))
}

/** Grab area in image pixels: constant on screen however far the image is zoomed. */
function hitSize(rect: Rect, scale: number): number {
  const onScreen = HANDLE_HIT_SIZE / (scale > 0 ? scale : 1)
  return Math.max(
    HANDLE_SIZE,
    Math.min(onScreen, rect.width * MAX_HIT_FRACTION, rect.height * MAX_HIT_FRACTION),
  )
}

/**
 * The handle under `point`, using a grab area larger than the drawn handle so
 * corners stay easy to catch. `scale` is CSS pixels per image pixel.
 */
export function handleAtPoint(rect: Rect, point: Point, scale = 1): HandleId | null {
  const anchors = handleAnchors(rect)
  const size = hitSize(rect, scale)
  return HIT_ORDER.find((id) => rectContains(squareAt(anchors[id], size), point)) ?? null
}

/** Drags one corner to the pointer, keeping the opposite corner anchored. */
export function resizeRect(rect: Rect, handle: HandleId, point: Point): Rect {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  switch (handle) {
    case 'nw':
      return normalizeRect(point, { x: right, y: bottom })
    case 'n':
      return normalizeRect({ x: left, y: point.y }, { x: right, y: bottom })
    case 'ne':
      return normalizeRect({ x: left, y: bottom }, point)
    case 'e':
      return normalizeRect({ x: left, y: top }, { x: point.x, y: bottom })
    case 'se':
      return normalizeRect({ x: left, y: top }, point)
    case 's':
      return normalizeRect({ x: left, y: top }, { x: right, y: point.y })
    case 'sw':
      return normalizeRect({ x: right, y: top }, point)
    case 'w':
      return normalizeRect({ x: point.x, y: top }, { x: right, y: bottom })
  }
}

export function moveAnnotation(
  annotation: Annotation,
  dx: number,
  dy: number,
): Annotation {
  switch (annotation.kind) {
    case 'box':
    case 'highlight':
    case 'blur':
      return { ...annotation, rect: offsetRect(annotation.rect, dx, dy) }
    case 'arrow':
      return {
        ...annotation,
        from: { x: annotation.from.x + dx, y: annotation.from.y + dy },
        to: { x: annotation.to.x + dx, y: annotation.to.y + dy },
      }
    case 'text':
      return { ...annotation, at: { x: annotation.at.x + dx, y: annotation.at.y + dy } }
  }
}
