/**
 * Four black arms and a centre dot over a white halo, so the reticle stays
 * visible on dark captures. The gaps isolate the dot so the hotspot remains
 * obvious without making the 32×32 cursor visually heavy.
 */
export const RETICLE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cpath d='M16 1V13M16 19V31M1 16H13M19 16H31' fill='none' stroke='%23fff' stroke-width='5'/%3E%3Cpath d='M16 1V13M16 19V31M1 16H13M19 16H31' fill='none' stroke='%23000' stroke-width='3'/%3E%3Ccircle cx='16' cy='16' r='3.5' fill='%23fff'/%3E%3Ccircle cx='16' cy='16' r='2' fill='%23000'/%3E%3C/svg%3E\") 16 16, crosshair"

/**
 * Capture-region pointer: a short dark hairline cross over a light halo, so it
 * reads on dark screens. Drawn by the OS so the exact drag origin never lags a
 * frame behind the pointer. The accent arms around it are drawn by the overlay
 * instead (see REGION_ARM_*) — Chromium drops any cursor image wider than
 * 128px, which is shorter than the arms.
 */
export const REGION_RETICLE_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Cpath d='M20 0V40M0 20H40' fill='none' stroke='%23fff' stroke-opacity='.9' stroke-width='3'/%3E%3Cpath d='M20 0V40M0 20H40' fill='none' stroke='%23000' stroke-opacity='.55' stroke-width='1'/%3E%3C/svg%3E\") 20 20, crosshair"

/** Full-screen guides: solid hairlines that meet at the pointer. */
export const REGION_GUIDE_THICKNESS = 1

/**
 * Accent arms flanking the pointer. Same colour as the guides, but heavier and
 * held off the centre so the pixels around the origin stay readable.
 */
export const REGION_ARM_LENGTH = 51
export const REGION_ARM_GAP = 20
export const REGION_ARM_WEIGHT = 4

/**
 * A window under the pointer is only a candidate, so its frame stays a
 * hairline with long dashes and short gaps — clearly lighter than a committed
 * selection, but still reading as a continuous edge.
 */
export const WINDOW_FRAME_DASH = 20
export const WINDOW_FRAME_GAP = 8

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
