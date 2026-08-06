import { calloutBadgeRect, calloutTailHandleRect } from './callout'
import { HANDLE_HIT_SIZE, HANDLE_SIZE } from './constants'
import type {
  Annotation,
  ArrowAnnotation,
  BoxAnnotation,
  CalloutAnnotation,
  CaptureDocument,
  TextAnnotation,
} from './document'
import {
  normalizeRect,
  offsetRect,
  type Point,
  type Rect,
  rectContains,
} from './geometry'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** Box uses all eight; arrow uses endpoints; text uses corners of its bounds. */
export type AnnotationHandleId = HandleId | 'from' | 'to'

export type EditableAnnotation = BoxAnnotation | ArrowAnnotation | TextAnnotation

export function isEditableAnnotation(
  annotation: Annotation,
): annotation is EditableAnnotation {
  return annotation.kind === 'box' || annotation.kind === 'arrow' || annotation.kind === 'text'
}

/** Rough per-character width as a fraction of font size, for text bounds. */
const TEXT_WIDTH_RATIO = 0.6
const TEXT_HEIGHT_RATIO = 1.25
/** Floor so a dragged text annotation never collapses to nothing. */
const MIN_FONT_SIZE = 8

export function annotationBounds(annotation: Annotation): Rect {
  switch (annotation.kind) {
    case 'box':
    case 'highlight':
    case 'blur':
      return annotation.rect
    case 'arrow':
      return normalizeRect(annotation.from, annotation.to)
    case 'callout':
      // The tail is part of the shape, so it belongs inside the bounds.
      return normalizeRect(
        {
          x: Math.min(annotation.rect.x, annotation.tail.x),
          y: Math.min(annotation.rect.y, annotation.tail.y),
        },
        {
          x: Math.max(annotation.rect.x + annotation.rect.width, annotation.tail.x),
          y: Math.max(annotation.rect.y + annotation.rect.height, annotation.tail.y),
        },
      )
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

/**
 * Which part of a callout the pointer is over: the delete badge, the round
 * handle that aims the tail, one of the eight resize handles, or the bubble.
 */
export type CalloutHit =
  | { readonly callout: CalloutAnnotation; readonly part: 'badge' | 'tail' | 'body' }
  | {
      readonly callout: CalloutAnnotation
      readonly part: 'handle'
      readonly handle: HandleId
    }

/**
 * Front-most callout under the point, or null. Controls are tested before the
 * bubble, and the tail's own grab area before the bubble's handles. `scale` is
 * CSS pixels per image pixel, which keeps every grab area constant on screen.
 */
export function calloutHitAtPoint(
  doc: CaptureDocument,
  point: Point,
  scale = 1,
): CalloutHit | null {
  for (let index = doc.annotations.length - 1; index >= 0; index -= 1) {
    const annotation = doc.annotations[index]!
    if (annotation.kind !== 'callout') continue

    // The badge straddles the corner, so it is tested before the bubble.
    if (rectContains(calloutBadgeRect(annotation.rect, scale), point)) {
      return { callout: annotation, part: 'badge' }
    }
    if (rectContains(calloutTailHandleRect(annotation.tail, scale), point)) {
      return { callout: annotation, part: 'tail' }
    }
    const handle = handleAtPoint(annotation.rect, point, scale)
    if (handle) return { callout: annotation, part: 'handle', handle }
    if (rectContains(annotation.rect, point)) {
      return { callout: annotation, part: 'body' }
    }
  }
  return null
}

export type EditableHit = {
  readonly annotation: EditableAnnotation
  /** Null means the body was hit, not a resize handle. */
  readonly handle: AnnotationHandleId | null
}

/**
 * Front-most box, arrow, or text under the point. Handles win over the body so
 * a corner grab always resizes rather than moves.
 */
export function editableHitAtPoint(
  doc: CaptureDocument,
  point: Point,
  scale = 1,
): EditableHit | null {
  for (let index = doc.annotations.length - 1; index >= 0; index -= 1) {
    const annotation = doc.annotations[index]!
    if (!isEditableAnnotation(annotation)) continue
    const handle = annotationHandleAtPoint(annotation, point, scale)
    if (handle) return { annotation, handle }
    if (rectContains(annotationBounds(annotation), point)) {
      return { annotation, handle: null }
    }
  }
  return null
}

const DRAW_ORDER: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Corners first, so they win wherever a corner and an edge grab area overlap. */
const HIT_ORDER: readonly HandleId[] = ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w']

const TEXT_CORNERS: readonly HandleId[] = ['nw', 'ne', 'se', 'sw']

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

/** Drawn handle squares for the hovered editable annotation. */
export function annotationHandleRects(
  annotation: EditableAnnotation,
): readonly { readonly id: AnnotationHandleId; readonly rect: Rect }[] {
  if (annotation.kind === 'arrow') {
    return [
      { id: 'from', rect: squareAt(annotation.from, HANDLE_SIZE) },
      { id: 'to', rect: squareAt(annotation.to, HANDLE_SIZE) },
    ]
  }
  if (annotation.kind === 'text') {
    const anchors = handleAnchors(annotationBounds(annotation))
    return TEXT_CORNERS.map((id) => ({ id, rect: squareAt(anchors[id], HANDLE_SIZE) }))
  }
  return handleRects(annotation.rect)
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

export function annotationHandleAtPoint(
  annotation: EditableAnnotation,
  point: Point,
  scale = 1,
): AnnotationHandleId | null {
  if (annotation.kind === 'arrow') {
    const size = HANDLE_HIT_SIZE / (scale > 0 ? scale : 1)
    if (rectContains(squareAt(annotation.from, size), point)) return 'from'
    if (rectContains(squareAt(annotation.to, size), point)) return 'to'
    return null
  }
  if (annotation.kind === 'text') {
    const bounds = annotationBounds(annotation)
    const anchors = handleAnchors(bounds)
    const size = hitSize(bounds, scale)
    return (
      TEXT_CORNERS.find((id) => rectContains(squareAt(anchors[id], size), point)) ?? null
    )
  }
  return handleAtPoint(annotation.rect, point, scale)
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

export function resizeAnnotation(
  annotation: EditableAnnotation,
  handle: AnnotationHandleId,
  point: Point,
): EditableAnnotation {
  if (annotation.kind === 'arrow') {
    if (handle === 'from') return { ...annotation, from: point }
    if (handle === 'to') return { ...annotation, to: point }
    return annotation
  }
  if (annotation.kind === 'text') {
    if (handle === 'from' || handle === 'to') return annotation
    const resized = resizeRect(annotationBounds(annotation), handle, point)
    return {
      ...annotation,
      at: { x: resized.x, y: resized.y },
      fontSize: Math.max(MIN_FONT_SIZE, resized.height / TEXT_HEIGHT_RATIO),
    }
  }
  if (handle === 'from' || handle === 'to') return annotation
  return { ...annotation, rect: resizeRect(annotation.rect, handle, point) }
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
    case 'callout':
      return {
        ...annotation,
        rect: offsetRect(annotation.rect, dx, dy),
        tail: { x: annotation.tail.x + dx, y: annotation.tail.y + dy },
      }
    case 'text':
      return { ...annotation, at: { x: annotation.at.x + dx, y: annotation.at.y + dy } }
  }
}
