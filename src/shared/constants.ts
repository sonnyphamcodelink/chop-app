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

/** The three weights the toolbar offers, in image pixels. */
export const STROKE_WIDTHS = { thin: 3, medium: 6, thick: 10 } as const

/** Deliberately bold: annotations are read at a glance, not studied. */
export const DEFAULT_STROKE_WIDTH = STROKE_WIDTHS.thick
export const DEFAULT_FONT_SIZE = 18

/** Callout bubble corner rounding, in image pixels. */
export const CALLOUT_CORNER_RADIUS = 10

/** Gap between the bubble edge and its text, in image pixels. */
export const CALLOUT_PADDING = 12

/** Line spacing for wrapped callout text, as a multiple of font size. */
export const CALLOUT_LINE_HEIGHT_RATIO = 1.3

/** Tail base width, as a fraction of the bubble's shorter edge. */
export const CALLOUT_TAIL_WIDTH_RATIO = 0.28
export const CALLOUT_MIN_TAIL_WIDTH = 12

/** How far a new callout's tail reaches, as a fraction of the bubble height. */
export const CALLOUT_TAIL_LENGTH_RATIO = 0.5
export const CALLOUT_MIN_TAIL_LENGTH = 28

/** Edge length of a callout's delete badge as drawn, in canvas pixels. */
export const CALLOUT_BADGE_SIZE = 22

/** How far a pointer may travel before a callout click counts as a drag, in canvas pixels. */
export const CALLOUT_DRAG_THRESHOLD = 3

/** Bubble size for a click with no drag, as multiples of the font size. */
export const CALLOUT_DEFAULT_WIDTH_RATIO = 9
export const CALLOUT_DEFAULT_HEIGHT_RATIO = 3

/** Edge length of a selection resize handle as drawn, in canvas pixels. */
export const HANDLE_SIZE = 10

/** Edge length of the (invisible) grab area around a handle, in canvas pixels. */
export const HANDLE_HIT_SIZE = 24
