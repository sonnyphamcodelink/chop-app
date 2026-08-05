/** Maximum number of document snapshots retained for undo. */
export const HISTORY_LIMIT = 50

/** Delay after the last edit before the flattened PNG is rewritten. */
export const AUTOSAVE_DEBOUNCE_MS = 800

/** Longest edge of a filmstrip thumbnail, in pixels. */
export const THUMBNAIL_SIZE = 256

/**
 * Edge length, in image pixels, of the grid a blur region is downsampled to.
 * This is the redaction: detail below this size is thrown away, not smeared.
 */
export const BLUR_SAMPLE_SIZE = 12

/** Longest the window provider may run before capture degrades to region-only. */
export const WINDOW_PROVIDER_TIMEOUT_MS = 1500

/** Windows smaller than this on either edge are ignored as capture targets. */
export const MIN_WINDOW_DIMENSION = 40

/** Drags smaller than this on either edge are treated as clicks, not regions. */
export const MIN_SELECTION_DIMENSION = 4

export const STROKE_WIDTH_MIN = 1
export const STROKE_WIDTH_MAX = 12
/** Deliberately bold: annotations are read at a glance, not studied. */
export const DEFAULT_STROKE_WIDTH = 10
export const DEFAULT_FONT_SIZE = 18

/** Edge length of a selection resize handle as drawn, in canvas pixels. */
export const HANDLE_SIZE = 10

/** Edge length of the (invisible) grab area around a handle, in canvas pixels. */
export const HANDLE_HIT_SIZE = 24
