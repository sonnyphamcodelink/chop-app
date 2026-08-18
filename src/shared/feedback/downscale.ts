/**
 * How far a pasted image is shrunk before it is sent. Pure arithmetic, kept
 * apart from the canvas work so the sizing can be tested without a DOM.
 */

/**
 * The longest edge an image travels at. A Retina screenshot is commonly 2880
 * across for 1440 points of layout, so 2000 still leaves UI text comfortably
 * above its logical size while cutting the pixel count by half.
 */
export const MAX_IMAGE_EDGE = 2000

export type Size = { readonly width: number; readonly height: number }

/** Fits an image inside a MAX_IMAGE_EDGE box without upscaling or distorting. */
export function downscaleSize(
  width: number,
  height: number,
  maxEdge: number = MAX_IMAGE_EDGE,
): Size {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * The sizes to draw through on the way down, ending at `to`. Nothing is reduced
 * by more than half in one step: a single large `drawImage` samples too sparsely
 * and turns small text into fringing, while repeated halving keeps it legible.
 *
 * Empty when no reduction is called for, which leaves the caller to draw once at
 * the original size — worth doing anyway, since the re-encode is where most of
 * the saving comes from.
 */
export function downscaleSteps(from: Size, to: Size): readonly Size[] {
  if (to.width >= from.width && to.height >= from.height) return []

  const steps: Size[] = []
  let current = from

  while (current.width > to.width * 2 && current.height > to.height * 2) {
    current = {
      width: Math.max(to.width, Math.round(current.width / 2)),
      height: Math.max(to.height, Math.round(current.height / 2)),
    }
    steps.push(current)
  }

  const last = steps[steps.length - 1]
  if (!last || last.width !== to.width || last.height !== to.height) steps.push(to)
  return steps
}
