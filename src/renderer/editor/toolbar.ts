import { STROKE_WIDTHS } from '@shared/constants'
import type { ToolId } from '@shared/tools'

const SVG_NS = 'http://www.w3.org/2000/svg'

type IconPart = {
  readonly tag: 'rect' | 'circle' | 'path'
  readonly attrs: Readonly<Record<string, string | number>>
}

/** Shared by every stroked part so the icons read as one family. */
const STROKED = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 } as const

const TOOL_ICONS: Readonly<Record<ToolId, readonly IconPart[]>> = {
  box: [{ tag: 'rect', attrs: { x: 3, y: 4, width: 14, height: 12, rx: 2, ...STROKED } }],
  arrow: [
    {
      tag: 'path',
      attrs: {
        d: 'M4 16L16 4M16 4H9M16 4V11',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        ...STROKED,
      },
    },
  ],
  text: [
    { tag: 'path', attrs: { d: 'M5 5H15M10 5V15', 'stroke-linecap': 'round', ...STROKED } },
  ],
  highlight: [
    {
      tag: 'rect',
      attrs: { x: 3, y: 12, width: 14, height: 4, rx: 1, fill: 'currentColor', opacity: 0.35 },
    },
    {
      tag: 'path',
      attrs: { d: 'M6 12L13 3L16 5.5L10 12', 'stroke-linejoin': 'round', ...STROKED },
    },
  ],
  blur: [
    { tag: 'circle', attrs: { cx: 10, cy: 10, r: 6.5, 'stroke-dasharray': '2.2 2.2', ...STROKED } },
  ],
  callout: [
    {
      tag: 'path',
      attrs: { d: 'M3 4H17V13H9L5.5 16.5V13H3V4Z', 'stroke-linejoin': 'round', ...STROKED },
    },
  ],
  crop: [
    {
      tag: 'path',
      attrs: { d: 'M6 2V14H18M14 6V18H2', 'stroke-linecap': 'square', ...STROKED },
    },
  ],
}

const ROUNDED = { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const

const ACTION_ICONS: Readonly<Record<'undo' | 'redo' | 'copy', readonly IconPart[]>> = {
  undo: [
    { tag: 'path', attrs: { d: 'M7.5 5.5L4 9l3.5 3.5M4 9h8a4.5 4.5 0 0 1 0 9H9', ...ROUNDED, ...STROKED } },
  ],
  redo: [
    { tag: 'path', attrs: { d: 'M12.5 5.5L16 9l-3.5 3.5M16 9H8a4.5 4.5 0 0 0 0 9h3', ...ROUNDED, ...STROKED } },
  ],
  copy: [
    { tag: 'rect', attrs: { x: 7, y: 7, width: 9, height: 9, rx: 2, ...STROKED } },
    { tag: 'path', attrs: { d: 'M13 4H4v9', ...ROUNDED, ...STROKED } },
  ],
}

const TOOLS: readonly { readonly id: ToolId; readonly label: string; readonly key: string }[] = [
  { id: 'box', label: 'Box', key: 'B' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'highlight', label: 'Highlight', key: 'H' },
  { id: 'blur', label: 'Blur', key: 'X' },
  { id: 'callout', label: 'Callout', key: 'N' },
  { id: 'crop', label: 'Crop', key: 'C' },
]

const COLORS: readonly { readonly label: string; readonly hex: string }[] = [
  { label: 'Red', hex: '#e5484d' },
  { label: 'Orange', hex: '#f0954d' },
  { label: 'Yellow', hex: '#f0c94d' },
  { label: 'Green', hex: '#4fb264' },
  { label: 'Blue', hex: '#4a8ff0' },
  { label: 'Purple', hex: '#9a6ff0' },
  { label: 'Black', hex: '#1c1c1e' },
  { label: 'White', hex: '#ffffff' },
]

/** `dot` is the marker drawn in the button, not the stroke it selects. */
const WEIGHTS: readonly {
  readonly label: string
  readonly width: number
  readonly dot: number
}[] = [
  { label: 'Thin', width: STROKE_WIDTHS.thin, dot: 3 },
  { label: 'Medium', width: STROKE_WIDTHS.medium, dot: 6 },
  { label: 'Thick', width: STROKE_WIDTHS.thick, dot: 9 },
]

export type ToolbarHandlers = {
  onTool(tool: ToolId): void
  onColor(color: string): void
  onStrokeWidth(width: number): void
  onUndo(): void
  onRedo(): void
  onCopy(): void
}

export type Toolbar = {
  setActive(tool: ToolId): void
  setColor(color: string): void
  setStrokeWidth(width: number): void
}

function createIcon(parts: readonly IconPart[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('width', '20')
  svg.setAttribute('height', '20')
  for (const part of parts) {
    const node = document.createElementNS(SVG_NS, part.tag)
    for (const [name, value] of Object.entries(part.attrs)) node.setAttribute(name, String(value))
    svg.append(node)
  }
  return svg
}

function addGroup(root: HTMLElement, className: string): HTMLDivElement {
  const group = document.createElement('div')
  group.className = `tb-group ${className}`
  root.append(group)
  return group
}

function addDivider(root: HTMLElement): void {
  const divider = document.createElement('div')
  divider.className = 'tb-divider'
  root.append(divider)
}

/** Marks exactly one button in a set, or none when nothing matches. */
function markActive<K>(buttons: ReadonlyMap<K, HTMLButtonElement>, selected: K | null): void {
  for (const [key, button] of buttons) {
    const isActive = key === selected
    button.classList.toggle('active', isActive)
    button.setAttribute('aria-pressed', String(isActive))
  }
}

export function createToolbar(root: HTMLElement, handlers: ToolbarHandlers): Toolbar {
  const toolButtons = new Map<ToolId, HTMLButtonElement>()
  const swatchButtons = new Map<string, HTMLButtonElement>()
  const weightButtons = new Map<number, HTMLButtonElement>()

  const tools = addGroup(root, 'tb-tools')
  for (const tool of TOOLS) {
    const button = document.createElement('button')
    button.className = 'tb-tool'
    button.type = 'button'
    button.title = `${tool.label} (${tool.key})`
    button.setAttribute('aria-label', tool.label)
    button.append(createIcon(TOOL_ICONS[tool.id]))
    button.addEventListener('click', () => handlers.onTool(tool.id))
    toolButtons.set(tool.id, button)
    tools.append(button)
  }

  addDivider(root)

  const colors = addGroup(root, 'tb-colors')
  for (const color of COLORS) {
    const swatch = document.createElement('button')
    swatch.className = 'tb-swatch'
    swatch.type = 'button'
    swatch.style.background = color.hex
    swatch.title = color.label
    swatch.setAttribute('aria-label', color.label)
    // White would otherwise disappear into the panel behind it.
    swatch.classList.toggle('tb-outlined', color.hex.toLowerCase() === '#ffffff')
    swatch.addEventListener('click', () => handlers.onColor(color.hex))
    swatchButtons.set(color.hex, swatch)
    colors.append(swatch)
  }

  addDivider(root)

  const weights = addGroup(root, 'tb-weights')
  for (const weight of WEIGHTS) {
    const button = document.createElement('button')
    button.className = 'tb-weight'
    button.type = 'button'
    button.title = `${weight.label} stroke`
    button.setAttribute('aria-label', `${weight.label} stroke`)

    const dot = document.createElement('div')
    dot.className = 'tb-dot'
    dot.style.width = `${weight.dot}px`
    dot.style.height = `${weight.dot}px`
    button.append(dot)

    button.addEventListener('click', () => handlers.onStrokeWidth(weight.width))
    weightButtons.set(weight.width, button)
    weights.append(button)
  }

  addDivider(root)

  const actions = addGroup(root, 'tb-actions')
  for (const [name, label, hint, handler] of [
    ['undo', 'Undo', '⌘Z', handlers.onUndo],
    ['redo', 'Redo', '⇧⌘Z', handlers.onRedo],
    ['copy', 'Copy', '⌘C', handlers.onCopy],
  ] as const) {
    const button = document.createElement('button')
    button.className = 'tb-action'
    button.type = 'button'
    button.title = `${label} (${hint})`
    button.setAttribute('aria-label', label)
    button.append(createIcon(ACTION_ICONS[name]))
    button.addEventListener('click', handler)
    actions.append(button)
  }

  return {
    setActive(tool: ToolId): void {
      markActive(toolButtons, tool)
    },

    // Documents can carry a colour or width that is not offered here, in which
    // case nothing is marked rather than the wrong button.
    setColor(color: string): void {
      const selected = COLORS.find((c) => c.hex.toLowerCase() === color.toLowerCase())
      markActive(swatchButtons, selected?.hex ?? null)
    },

    setStrokeWidth(width: number): void {
      markActive(weightButtons, weightButtons.has(width) ? width : null)
    },
  }
}
