import type { Point } from '@shared/geometry'
import { annotationFont } from '@shared/render'
import type { ToolStyle } from '@shared/tools'

export type TextInputOptions = {
  /** Where the field sits, in stage coordinates. */
  readonly at: Point
  readonly style: ToolStyle
  /** CSS pixels per image pixel, so the field matches the drawn size. */
  readonly scale: number
  /** Field width in CSS pixels. Omitted, the field sizes itself. */
  readonly width?: number
  /** Existing text to edit, pre-selected so typing replaces it. */
  readonly initialText?: string
  /** Called with the trimmed text. An empty field commits nothing. */
  readonly onCommit: (text: string) => void
}

export type TextInput = {
  open(options: TextInputOptions): void
  close(): void
}

/**
 * Canvas has no text entry, so an HTML input is positioned over the canvas and
 * committed on Enter or blur. The caller decides what the text becomes.
 */
export function createTextInput(element: HTMLInputElement): TextInput {
  let pending: TextInputOptions | null = null

  function close(): void {
    pending = null
    element.value = ''
    element.style.display = 'none'
    element.style.width = ''
  }

  function commit(): void {
    const text = element.value.trim()
    const options = pending
    close()
    if (text && options) options.onCommit(text)
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
    if (pending) commit()
  })

  return {
    open(options): void {
      pending = options
      element.style.display = 'block'
      element.style.left = `${options.at.x}px`
      element.style.top = `${options.at.y}px`
      element.style.width = options.width ? `${options.width}px` : ''
      element.style.font = annotationFont(options.style.fontSize * options.scale)
      element.style.color = options.style.color
      element.value = options.initialText ?? ''
      element.focus()
      element.select()
    },
    close,
  }
}
