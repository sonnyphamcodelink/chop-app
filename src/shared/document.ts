import type { Point, Rect } from './geometry'

export type BoxAnnotation = {
  readonly id: string
  readonly kind: 'box'
  readonly rect: Rect
  readonly color: string
  readonly strokeWidth: number
}

export type ArrowAnnotation = {
  readonly id: string
  readonly kind: 'arrow'
  readonly from: Point
  readonly to: Point
  readonly color: string
  readonly strokeWidth: number
}

export type TextAnnotation = {
  readonly id: string
  readonly kind: 'text'
  readonly at: Point
  readonly text: string
  readonly color: string
  readonly fontSize: number
}

export type HighlightAnnotation = {
  readonly id: string
  readonly kind: 'highlight'
  readonly rect: Rect
  readonly color: string
}

export type BlurAnnotation = {
  readonly id: string
  readonly kind: 'blur'
  readonly rect: Rect
}

export type Annotation =
  | BoxAnnotation
  | ArrowAnnotation
  | TextAnnotation
  | HighlightAnnotation
  | BlurAnnotation

export type CaptureDocument = {
  readonly id: string
  /** Full source image size in pixels, independent of any crop. */
  readonly width: number
  readonly height: number
  /** Non-destructive crop in image coordinates, or null for the full image. */
  readonly cropRect: Rect | null
  /** Ordered back to front. */
  readonly annotations: readonly Annotation[]
}

export function createDocument(id: string, width: number, height: number): CaptureDocument {
  return { id, width, height, cropRect: null, annotations: [] }
}

export function addAnnotation(doc: CaptureDocument, annotation: Annotation): CaptureDocument {
  return { ...doc, annotations: [...doc.annotations, annotation] }
}

export function updateAnnotation(
  doc: CaptureDocument,
  id: string,
  update: (annotation: Annotation) => Annotation,
): CaptureDocument {
  return {
    ...doc,
    annotations: doc.annotations.map((a) => (a.id === id ? update(a) : a)),
  }
}

export function removeAnnotation(doc: CaptureDocument, id: string): CaptureDocument {
  return { ...doc, annotations: doc.annotations.filter((a) => a.id !== id) }
}

export function setCrop(doc: CaptureDocument, rect: Rect | null): CaptureDocument {
  return { ...doc, cropRect: rect }
}

export function outputSize(doc: CaptureDocument): {
  readonly width: number
  readonly height: number
} {
  if (!doc.cropRect) return { width: doc.width, height: doc.height }
  return { width: doc.cropRect.width, height: doc.cropRect.height }
}

export function serializeDocument(doc: CaptureDocument): string {
  return JSON.stringify(doc)
}

const KINDS: readonly Annotation['kind'][] = ['box', 'arrow', 'text', 'highlight', 'blur']

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.x === 'number' &&
    typeof r.y === 'number' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number' &&
    Number.isFinite(r.x) &&
    Number.isFinite(r.y) &&
    Number.isFinite(r.width) &&
    Number.isFinite(r.height)
  )
}

function isAnnotation(value: unknown): value is Annotation {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { kind?: unknown; id?: unknown }
  return (
    typeof candidate.id === 'string' &&
    KINDS.includes(candidate.kind as Annotation['kind'])
  )
}

/** Validates untrusted JSON from disk. Unknown annotation kinds are dropped. */
export function parseDocument(json: string): CaptureDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('capture document is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('capture document must be an object')
  }

  const { id, width, height, cropRect, annotations } = parsed as Record<string, unknown>
  if (typeof id !== 'string' || typeof width !== 'number' || typeof height !== 'number') {
    throw new Error('capture document is missing id, width, or height')
  }

  return {
    id,
    width,
    height,
    cropRect: isRect(cropRect) ? cropRect : null,
    annotations: Array.isArray(annotations) ? annotations.filter(isAnnotation) : [],
  }
}
