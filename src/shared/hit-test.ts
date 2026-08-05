import { HANDLE_SIZE } from './constants'
import type { Annotation, CaptureDocument } from './document'
import {
  normalizeRect,
  offsetRect,
  type Point,
  type Rect,
  rectContains,
} from './geometry'

export type HandleId = 'nw' | 'ne' | 'sw' | 'se'

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

export function handleRects(
  rect: Rect,
): readonly { readonly id: HandleId; readonly rect: Rect }[] {
  const half = HANDLE_SIZE / 2
  const at = (x: number, y: number): Rect => ({
    x: x - half,
    y: y - half,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  })
  return [
    { id: 'nw', rect: at(rect.x, rect.y) },
    { id: 'ne', rect: at(rect.x + rect.width, rect.y) },
    { id: 'sw', rect: at(rect.x, rect.y + rect.height) },
    { id: 'se', rect: at(rect.x + rect.width, rect.y + rect.height) },
  ]
}

export function handleAtPoint(rect: Rect, point: Point): HandleId | null {
  return handleRects(rect).find((handle) => rectContains(handle.rect, point))?.id ?? null
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
    case 'ne':
      return normalizeRect({ x: left, y: bottom }, point)
    case 'sw':
      return normalizeRect({ x: right, y: top }, point)
    case 'se':
      return normalizeRect({ x: left, y: top }, point)
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
