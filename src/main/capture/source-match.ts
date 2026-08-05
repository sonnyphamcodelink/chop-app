import type { DisplayInfo } from '@shared/coords'

type SourceLike = { readonly id: string; readonly display_id: string }

export function toDisplayInfo(display: Electron.Display): DisplayInfo {
  return {
    id: display.id,
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
    scaleFactor: display.scaleFactor,
  }
}

/**
 * `display_id` is the reliable link between a Display and a capturer source, but
 * it is empty on some platforms, so fall back to source ordering.
 */
export function matchSourceToDisplay<T extends SourceLike>(
  sources: readonly T[],
  displayId: number,
  index?: number,
): T | null {
  const byId = sources.find((source) => source.display_id === String(displayId))
  if (byId) return byId
  if (index === undefined) return null
  return sources[index] ?? null
}
