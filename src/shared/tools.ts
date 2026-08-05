import { DEFAULT_FONT_SIZE, DEFAULT_STROKE_WIDTH } from './constants'
import type { Annotation } from './document'
import { isDegenerateRect, normalizeRect, type Point } from './geometry'

export type ToolId = 'select' | 'box' | 'arrow' | 'text' | 'highlight' | 'blur' | 'crop'

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

const DEFAULT_COLOR = '#ff3b30'

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
  return tool === 'box' || tool === 'arrow' || tool === 'highlight' || tool === 'blur'
}

/**
 * Converts a completed drag into an annotation, or null when the drag is too
 * small or the tool handles its own interaction (text, crop, select).
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
    default:
      return null
  }
}
