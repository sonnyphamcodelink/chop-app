/**
 * Four black arms and a centre dot. The gaps isolate the dot so the hotspot
 * remains obvious without making the 32×32 cursor visually heavy.
 */
export const RETICLE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cpath d='M16 1V13M16 19V31M1 16H13M19 16H31' fill='none' stroke='%23000' stroke-width='3'/%3E%3Ccircle cx='16' cy='16' r='2' fill='%23000'/%3E%3C/svg%3E\") 16 16, crosshair"

/**
 * Capture-region reticle: four longer amber arms with a dark outline. The
 * 6px centre gap leaves the exact drag origin visible.
 */
export const REGION_RETICLE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cg fill='none' stroke-linecap='butt'%3E%3Cpath d='M20 1V17M20 23V39M1 20H17M23 20H39' stroke='%23000' stroke-opacity='.8' stroke-width='7'/%3E%3Cpath d='M20 1V17M20 23V39M1 20H17M23 20H39' stroke='%23f5a000' stroke-width='4'/%3E%3C/g%3E%3C/svg%3E\") 20 20, crosshair"

export type CursorHit =
  | { readonly kind: 'none' }
  | { readonly kind: 'move' }
  | { readonly kind: 'pointer' }
  | { readonly kind: 'resize'; readonly cursor: string }

/** Idle / drawing cursor when nothing grabbable is under the pointer. */
export function canvasCursor(hit: CursorHit): string {
  switch (hit.kind) {
    case 'none':
      return RETICLE_CURSOR
    case 'move':
      return 'move'
    case 'pointer':
      return 'pointer'
    case 'resize':
      return hit.cursor
  }
}
