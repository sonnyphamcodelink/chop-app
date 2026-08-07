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
  /** Fires on every keystroke so the caller can drive a live canvas preview. */
  readonly onInput?: (text: string) => void
  /** Called with the final text on Enter or blur. */
  readonly onCommit: (text: string) => void
  /** Called on Escape, or when commit fires with empty text. */
  readonly onCancel?: () => void
}

export type TextInput = {
  open(options: TextInputOptions): void
  close(): void
  commit(): void
  cancel(): void
  readonly isOpen: boolean
}

/**
 * Canvas has no text entry, so an HTML textarea is positioned over the canvas
 * and committed on Enter or blur. An optional `onInput` callback fires on every
 * keystroke so the caller can show a live preview on the canvas.
 */
export function createTextInput(element: HTMLTextAreaElement): TextInput {
  let pending: TextInputOptions | null = null

  function close(): void {
    pending = null
    element.value = ''
    element.style.display = 'none'
    element.style.width = ''
    element.style.height = ''
  }

  function commit(): void {
    const text = element.value.trim()
    const options = pending
    close()
    if (!options) return
    if (text) options.onCommit(text)
    else options.onCancel?.()
  }

  function cancel(): void {
    const options = pending
    close()
    options?.onCancel?.()
  }

  function applyHeight(): void {
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
    event.stopPropagation()
  })

  element.addEventListener('input', () => {
    if (!pending) return
    pending.onInput?.(element.value)
    applyHeight()
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
      applyHeight()
      element.focus()
      element.select()
    },
    close,
    commit,
    cancel,
    get isOpen() { return pending !== null },
  }
}
