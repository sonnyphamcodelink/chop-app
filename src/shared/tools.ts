import { calloutFontSizeFor, defaultTailPoint } from './callout'
import {
  CALLOUT_DEFAULT_HEIGHT_RATIO,
  CALLOUT_DEFAULT_WIDTH_RATIO,
  DEFAULT_FONT_SIZE,
  DEFAULT_STROKE_WIDTH,
} from './constants'
import type { Annotation, CalloutAnnotation, CaptureDocument } from './document'
import { isDegenerateRect, normalizeRect, type Point, type Rect } from './geometry'

export type ToolId = 'box' | 'arrow' | 'text' | 'highlight' | 'blur' | 'callout' | 'crop'

export type ToolStyle = {
  readonly color: string
  readonly strokeWidth: number
  readonly fontSize: number
}

export type Draft = {
  readonly tool: ToolId
  readonly start: Point
  readonly current: Point
}

const DEFAULT_COLOR = '#e5484d'

export function defaultStyle(): ToolStyle {
  return {
    color: DEFAULT_COLOR,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    fontSize: DEFAULT_FONT_SIZE,
  }
}

export function beginDraft(tool: ToolId, point: Point): Draft {
  return { tool, start: point, current: point }
}

export function updateDraft(draft: Draft, point: Point): Draft {
  return { ...draft, current: point }
}

/** Shape tools that build an annotation directly from a drag. */
export function isDrawingTool(tool: ToolId): boolean {
  return (
    tool === 'box' ||
    tool === 'arrow' ||
    tool === 'highlight' ||
    tool === 'blur' ||
    tool === 'callout'
  )
}

/**
 * The bubble a callout drag asks for. A click with no real drag still gets a
 * usable bubble rather than nothing, since the text comes afterwards either way.
 */
export function calloutRect(draft: Draft, style: ToolStyle): Rect {
  const rect = normalizeRect(draft.start, draft.current)
  if (!isDegenerateRect(rect)) return rect
  return {
    x: draft.start.x,
    y: draft.start.y,
    width: style.fontSize * CALLOUT_DEFAULT_WIDTH_RATIO,
    height: style.fontSize * CALLOUT_DEFAULT_HEIGHT_RATIO,
  }
}

/**
 * A bubble with no note yet. The font size belongs to the bubble, not the
 * toolbar: it is refitted whenever the note or the bubble changes.
 */
export function createCallout(rect: Rect, style: ToolStyle, id: string): CalloutAnnotation {
  return {
    id,
    kind: 'callout',
    rect,
    tail: defaultTailPoint(rect),
    text: '',
    color: style.color,
    fontSize: calloutFontSizeFor(rect),
  }
}

/**
 * Converts a completed drag into an annotation, or null when the drag is too
 * small or the tool handles its own interaction (text, crop).
 */
export function draftToAnnotation(
  draft: Draft,
  style: ToolStyle,
  id: string,
): Annotation | null {
  const rect = normalizeRect(draft.start, draft.current)
  if (isDegenerateRect(rect)) return null

  switch (draft.tool) {
    case 'box':
      return { id, kind: 'box', rect, color: style.color, strokeWidth: style.strokeWidth }
    case 'arrow':
      // Direction matters for an arrow, so use the raw endpoints.
      return {
        id, kind: 'arrow',
        from: draft.start, to: draft.current,
        color: style.color, strokeWidth: style.strokeWidth,
      }
    case 'highlight':
      return { id, kind: 'highlight', rect, color: style.color }
    case 'blur':
      return { id, kind: 'blur', rect }
    case 'callout':
      // Empty until the note is typed onto it: the drag only sizes the bubble.
      return createCallout(rect, style, id)
    default:
      return null
  }
}

const DRAFT_ANNOTATION_ID = '__draft__'

/** Temporary top annotation for on-screen paint. Never commit this id into history. */
export function documentWithDraft(
  doc: CaptureDocument,
  draft: Draft | null,
  style: ToolStyle,
): CaptureDocument {
  if (!draft) return doc
  const annotation = draftToAnnotation(draft, style, DRAFT_ANNOTATION_ID)
  if (!annotation) return doc
  return { ...doc, annotations: [...doc.annotations, annotation] }
}
