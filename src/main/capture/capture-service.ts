import { desktopCapturer, screen } from 'electron'
import { type DisplayInfo, type PixelSize, physicalSize } from '@shared/coords'
import { ensureScreenPermission } from '../permissions'
import { groupDisplaysBySize, matchSourceToDisplay, toDisplayInfo } from './source-match'

export { matchSourceToDisplay, toDisplayInfo }

/** A full-resolution frozen screenshot of one display. */
export type DisplayCapture = {
  readonly display: DisplayInfo
  /** PNG data URL at true physical pixel resolution. */
  readonly dataUrl: string
}

/**
 * Grabs every display at one exact frame size.
 *
 * `thumbnailSize` letterbox-fits every source into the box it is given, so a
 * display whose framebuffer does not match `size` comes back rescaled. Only the
 * displays this size was computed for are trusted from the result.
 */
async function captureAtSize(
  displays: readonly DisplayInfo[],
  size: PixelSize,
  indexOf: (display: DisplayInfo) => number,
): Promise<readonly DisplayCapture[]> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: size,
    fetchWindowIcons: false,
  })

  return displays.flatMap((display): readonly DisplayCapture[] => {
    const source = matchSourceToDisplay(sources, display.id, indexOf(display))
    if (!source || source.thumbnail.isEmpty()) {
      console.warn(`No capture source for display ${display.id}; skipping.`)
      return []
    }
    return [{ display, dataUrl: source.thumbnail.toDataURL() }]
  })
}

/**
 * Screenshots every display at full physical resolution before any UI appears.
 * This is the freeze-frame the overlays draw on.
 *
 * Displays are grouped by framebuffer size and grabbed one group at a time.
 * A single grab sized to the largest display would letterbox-fit every smaller
 * one into that box, resampling its entire screenshot — text on a secondary
 * monitor would arrive already blurred, before the editor ever touched it.
 */
export async function captureAllDisplays(): Promise<readonly DisplayCapture[]> {
  if (!(await ensureScreenPermission())) return []

  const displays = screen.getAllDisplays().map(toDisplayInfo)
  const indexOf = (display: DisplayInfo): number =>
    displays.findIndex((candidate) => candidate.id === display.id)

  const groups = groupDisplaysBySize(displays, physicalSize)
  const captured = await Promise.all(
    groups.map((group) => captureAtSize(group.displays, group.size, indexOf)),
  )
  // Grouping shuffles displays; hand them back in screen order, as callers see them.
  return captured.flat().sort((a, b) => indexOf(a.display) - indexOf(b.display))
}
