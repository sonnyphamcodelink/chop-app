import type { Point } from '@shared/geometry'
import type { ToolStyle } from '@shared/tools'

export type TextInput = {
  /** `viewPoint` is in stage coordinates; `imagePoint` is where the text lands. */
  open(viewPoint: Point, imagePoint: Point, style: ToolStyle, scale: number): void
  close(): void
}

/**
 * Canvas has no text entry, so an HTML input is positioned over the canvas and
 * committed on Enter or blur.
 */
export function createTextInput(
  element: HTMLInputElement,
  onCommit: (text: string, at: Point) => void,
): TextInput {
  let anchor: Point | null = null

  function close(): void {
    anchor = null
    element.value = ''
    element.style.display = 'none'
  }

  function commit(): void {
    const text = element.value.trim()
    const at = anchor
    close()
    if (text && at) onCommit(text, at)
  }

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
    // Keep editor shortcuts from firing while typing.
    event.stopPropagation()
  })
  element.addEventListener('blur', () => {
    if (anchor) commit()
  })

  return {
    open(viewPoint, imagePoint, style, scale): void {
      anchor = imagePoint
      element.style.display = 'block'
      element.style.left = `${viewPoint.x}px`
      element.style.top = `${viewPoint.y}px`
      element.style.font = `${style.fontSize * scale}px -apple-system, system-ui, sans-serif`
      element.style.color = style.color
      element.value = ''
      element.focus()
    },
    close,
  }
}
