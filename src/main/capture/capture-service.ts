import { desktopCapturer, screen } from 'electron'
import { type DisplayInfo, physicalSize } from '@shared/coords'
import { ensureScreenPermission } from '../permissions'
import { matchSourceToDisplay, toDisplayInfo } from './source-match'

export { matchSourceToDisplay, toDisplayInfo }

/** A full-resolution frozen screenshot of one display. */
export type DisplayCapture = {
  readonly display: DisplayInfo
  /** PNG data URL at true physical pixel resolution. */
  readonly dataUrl: string
}

/**
 * Screenshots every display at full physical resolution before any UI appears.
 * This is the freeze-frame the overlays draw on.
 */
export async function captureAllDisplays(): Promise<readonly DisplayCapture[]> {
  if (!(await ensureScreenPermission())) return []

  const displays = screen.getAllDisplays().map(toDisplayInfo)
  const largest = displays.reduce(
    (max, display) => {
      const size = physicalSize(display)
      return {
        width: Math.max(max.width, size.width),
        height: Math.max(max.height, size.height),
      }
    },
    { width: 0, height: 0 },
  )

  // thumbnailSize is a ceiling applied to every source, so request the largest
  // display's physical size; smaller displays come back at their native size.
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: largest,
    fetchWindowIcons: false,
  })

  return displays.flatMap((display, index): readonly DisplayCapture[] => {
    const source = matchSourceToDisplay(sources, display.id, index)
    if (!source || source.thumbnail.isEmpty()) {
      console.warn(`No capture source for display ${display.id}; skipping.`)
      return []
    }
    return [{ display, dataUrl: source.thumbnail.toDataURL() }]
  })
}
