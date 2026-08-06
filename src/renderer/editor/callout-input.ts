import { annotationFont } from '@shared/render'
import type { Point } from '@shared/geometry'

/** Where and how the overlay must sit to look like part of the bubble. */
export type CalloutInputGeometry = {
  /** Top-left of the bubble, in stage coordinates. */
  readonly at: Point
  /** Bubble size in CSS pixels, used to centre the text inside it. */
  readonly width: number
  readonly height: number
  /** Width available for text, in CSS pixels. Matches the canvas wrap width. */
  readonly textWidth: number
  readonly fontSize: number
  readonly lineHeight: number
  readonly color: string
}

export type CalloutInputOptions = {
  readonly geometry: CalloutInputGeometry
  readonly initialText: string
  /** Fires on every keystroke, so the bubble can grow under the caret. */
  readonly onInput: (text: string) => void
  readonly onCommit: (text: string) => void
  readonly onCancel: () => void
}

export type CalloutInput = {
  open(options: CalloutInputOptions): void
  /** Finishes the note now, as a blur would. Does nothing when nothing is open. */
  commit(): void
  /** Moves the overlay after the bubble it sits on has changed shape. */
  reposition(geometry: CalloutInputGeometry): void
  /** Closes without committing or cancelling; the caller owns the document. */
  close(): void
  readonly isOpen: boolean
}

/**
 * Typing happens on the bubble itself: a transparent textarea is laid over the
 * callout with the same font, width and centring the canvas uses, so the note
 * appears to be typed straight onto the annotation. The canvas hides the text
 * it is editing, leaving this overlay as the only copy on screen.
 */
export function createCalloutInput(element: HTMLTextAreaElement): CalloutInput {
  let pending: CalloutInputOptions | null = null

  function place(geometry: CalloutInputGeometry): void {
    element.style.width = `${geometry.textWidth}px`
    element.style.font = annotationFont(geometry.fontSize)
    element.style.lineHeight = `${geometry.lineHeight}px`
    element.style.color = geometry.color
    element.style.caretColor = geometry.color
    element.style.left = `${geometry.at.x + (geometry.width - geometry.textWidth) / 2}px`

    // Height follows the wrapped text, then the block is centred in the bubble
    // exactly as `drawCallout` centres it.
    element.style.height = 'auto'
    const contentHeight = Math.max(element.scrollHeight, geometry.lineHeight)
    element.style.height = `${contentHeight}px`
    element.style.top = `${geometry.at.y + (geometry.height - contentHeight) / 2}px`
  }

  function close(): void {
    pending = null
    element.value = ''
    element.style.display = 'none'
  }

  function commit(): void {
    const options = pending
    if (!options) return
    const text = element.value.trim()
    close()
    options.onCommit(text)
  }

  function cancel(): void {
    const options = pending
    if (!options) return
    close()
    options.onCancel()
  }

  element.addEventListener('keydown', (event) => {
    // Every Enter commits: the canvas wraps on width alone, so a line break
    // typed here would be drawn as a plain space.
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
    // Keep editor shortcuts from firing while typing.
    event.stopPropagation()
  })
  element.addEventListener('input', () => {
    pending?.onInput(element.value.trim())
  })
  element.addEventListener('blur', () => {
    if (pending) commit()
  })

  return {
    open(options): void {
      pending = options
      element.style.display = 'block'
      element.value = options.initialText
      place(options.geometry)
      element.focus()
      // A fresh note starts empty; an existing one is selected so typing replaces it.
      element.select()
    },

    commit,

    reposition(geometry): void {
      if (pending) place(geometry)
    },

    close,

    get isOpen(): boolean {
      return pending !== null
    },
  }
}
