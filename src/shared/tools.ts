import { calloutFontSizeFor, calloutRectFor, defaultCalloutSize } from './callout'
import { DEFAULT_FONT_SIZE, DEFAULT_STROKE_WIDTH, MIN_SELECTION_DIMENSION } from './constants'
import { type Annotation, type CalloutAnnotation, type CaptureDocument, outputSize } from './document'
import { isDegenerateRect, normalizeRect, type Point, type Rect, type Size } from './geometry'

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
 * A bubble with no note yet, pointing at `tail`. The font size belongs to the
 * bubble, not the toolbar: it is refitted whenever the note or the bubble
 * changes.
 */
export function createCallout(
  rect: Rect,
  tail: Point,
  style: ToolStyle,
  id: string,
): CalloutAnnotation {
  return {
    id,
    kind: 'callout',
    rect,
    tail,
    text: '',
    color: style.color,
    fontSize: calloutFontSizeFor(rect),
  }
}

/**
 * Converts a completed drag into an annotation, or null when the drag is too
 * small or the tool handles its own interaction (text, crop). `view` is the
 * capture as the user sees it, which is what a callout's default size is
 * measured against.
 */
export function draftToAnnotation(
  draft: Draft,
  style: ToolStyle,
  id: string,
  view: Size,
): Annotation | null {
  // A callout is aimed rather than drawn out: the press marks what the note
  // points at and the release places the bubble, so how far the pointer
  // travelled is all that says whether this was a drag at all.
  if (draft.tool === 'callout') {
    const travel = Math.hypot(draft.current.x - draft.start.x, draft.current.y - draft.start.y)
    if (travel < MIN_SELECTION_DIMENSION) return null
    const { width, height } = defaultCalloutSize(view, style.fontSize)
    return createCallout(
      calloutRectFor(draft.start, draft.current, width, height),
      draft.start,
      style,
      id,
    )
  }

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
  const annotation = draftToAnnotation(draft, style, DRAFT_ANNOTATION_ID, outputSize(doc))
  if (!annotation) return doc
  return { ...doc, annotations: [...doc.annotations, annotation] }
}
