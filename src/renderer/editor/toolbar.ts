import type { ToolId } from '@shared/tools'

const TOOLS: readonly { readonly id: ToolId; readonly label: string; readonly key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'box', label: 'Box', key: 'B' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'highlight', label: 'Highlight', key: 'H' },
  { id: 'blur', label: 'Blur', key: 'X' },
  { id: 'crop', label: 'Crop', key: 'C' },
]

const COLORS: readonly string[] = [
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#2f9bff', '#af52de', '#000000', '#ffffff',
]

export type ToolbarHandlers = {
  onTool(tool: ToolId): void
  onColor(color: string): void
  onStrokeWidth(width: number): void
  onUndo(): void
  onRedo(): void
  onCopy(): void
}

export function createToolbar(
  root: HTMLElement,
  handlers: ToolbarHandlers,
): { setActive(tool: ToolId): void } {
  const buttons = new Map<ToolId, HTMLButtonElement>()

  for (const tool of TOOLS) {
    const button = document.createElement('button')
    button.className = 'tool'
    button.textContent = tool.label
    button.title = `${tool.label} (${tool.key})`
    button.addEventListener('click', () => handlers.onTool(tool.id))
    buttons.set(tool.id, button)
    root.append(button)
  }

  const swatches = document.createElement('div')
  swatches.className = 'swatches'
  for (const color of COLORS) {
    const swatch = document.createElement('button')
    swatch.className = 'swatch'
    swatch.style.background = color
    swatch.title = color
    swatch.addEventListener('click', () => handlers.onColor(color))
    swatches.append(swatch)
  }
  root.append(swatches)

  const width = document.createElement('input')
  width.type = 'range'
  width.min = '1'
  width.max = '12'
  width.value = '3'
  width.title = 'Stroke width'
  width.addEventListener('input', () => handlers.onStrokeWidth(Number(width.value)))
  root.append(width)

  for (const [label, handler] of [
    ['Undo', handlers.onUndo],
    ['Redo', handlers.onRedo],
    ['Copy', handlers.onCopy],
  ] as const) {
    const button = document.createElement('button')
    button.className = 'action'
    button.textContent = label
    button.addEventListener('click', handler)
    root.append(button)
  }

  return {
    setActive(tool: ToolId): void {
      for (const [id, button] of buttons) {
        button.classList.toggle('active', id === tool)
      }
    },
  }
}
