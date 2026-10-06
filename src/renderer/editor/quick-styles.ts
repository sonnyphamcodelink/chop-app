import type { EditorState } from '@shared/editor-state'
import { currentDocument } from '@shared/editor-state'
import { readableTextColor } from '@shared/callout'
import type { StepSequence, StepShape } from '@shared/document'
import { formatStepLabel } from '@shared/step'
import type { ToolStyle } from '@shared/tools'
import { createColorPicker } from './color-picker'
import { STEP_MAX_SIZE, STEP_MIN_SIZE, STROKE_WIDTH_MIN, STROKE_WIDTH_MAX } from '@shared/constants'

/** Box preset rows, top to bottom. */
const BOX_PRESET_WIDTHS = [6, 10, 15] as const

const ARROW_PRESET_WIDTHS = [10, 15, 20] as const

const COLORS = [
  ['Red', '#e5484d'], ['Green', '#4fb264'], ['Blue', '#4a8ff0'], ['Yellow', '#f0c94d'],
] as const

/** Step preset rows, top to bottom: each a badge shape counting in one type. */
const STEP_PRESETS: readonly (readonly [StepShape, StepSequence])[] = [
  ['circle', 'number'], ['pin', 'number'], ['circle', 'upper'], ['pin', 'upper'],
]

const STEP_SHAPE_NAMES: Readonly<Record<StepShape, string>> = { circle: 'Circle', pin: 'Pin', square: 'Square' }
const STEP_SEQUENCE_NAMES: Readonly<Record<StepSequence, string>> = {
  number: '1… 2… 3…', lower: 'a… b… c…', upper: 'A… B… C…',
}

/** A preview of one step preset, drawn in the 64×56 preset tile. */
function stepPresetMark(shape: StepShape, sequence: StepSequence, hex: string): string {
  const label = `<text x="28" y="34" fill="${readableTextColor(hex)}" style="font-weight:600">${formatStepLabel(1, sequence)}</text>`
  const badge = shape === 'pin'
    ? `<path d="M53.5 28L36.8 40.1A15 15 0 1 1 36.8 15.9Z" fill="${hex}"/>`
    : shape === 'square'
      ? `<rect x="13" y="13" width="30" height="30" rx="6" fill="${hex}"/>`
      : `<circle cx="28" cy="28" r="15" fill="${hex}"/>`
  return badge + label
}

function stepPresetButtons(apply: (patch: Partial<ToolStyle>) => void): HTMLButtonElement[] {
  return STEP_PRESETS.flatMap(([shape, sequence]) => COLORS.map(([name, hex]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'qs-preset'
    button.dataset.color = hex
    button.dataset.shape = shape
    button.dataset.sequence = sequence
    button.setAttribute('aria-label', `${name} ${STEP_SHAPE_NAMES[shape].toLowerCase()} ${STEP_SEQUENCE_NAMES[sequence]} style`)
    button.title = button.getAttribute('aria-label')!
    button.innerHTML = `<svg viewBox="0 0 64 56" aria-hidden="true">${stepPresetMark(shape, sequence, hex)}</svg>`
    button.addEventListener('click', () => apply({ color: hex, stepShape: shape, stepSequence: sequence }))
    return button
  }))
}

function options<K extends string>(names: Readonly<Record<K, string>>): string {
  return Object.entries<string>(names).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')
}

/** Presets use the same properties as the drawing tools and saved annotations. */
export function createQuickStyles(root: HTMLElement, apply: (patch: Partial<ToolStyle>) => void) {
  root.innerHTML = `<h2>Quick Styles</h2><p class="qs-context"></p>
    <div class="qs-grid" role="group" aria-label="Style presets"></div>
    <p class="qs-empty" hidden>This tool has no style properties.</p>
    <section class="qs-properties"><h2>Tool Properties</h2>
      <div class="qs-color-row">Color <div class="qs-color"></div></div>
      <div class="qs-slider-row"><span>Opacity</span><input class="qs-opacity" type="range" min="0" max="100" aria-label="Style opacity"><output class="qs-opacity-value">100%</output></div>
      <div class="qs-width qs-slider-row"><span>Line width</span><input type="range" min="${STROKE_WIDTH_MIN}" max="${STROKE_WIDTH_MAX}" step="0.1" aria-label="Style line width"><span class="qs-unit-input"><input type="number" min="${STROKE_WIDTH_MIN}" max="${STROKE_WIDTH_MAX}" step="0.1" aria-label="Line width value (pt)"><span aria-hidden="true">pt</span></span></div>
      <p class="qs-auto">Callout text automatically fits and centers in the box.</p>
      <div class="qs-step">
        <label>Shape <select aria-label="Step shape">${options(STEP_SHAPE_NAMES)}</select></label>
        <label>Type <select aria-label="Step type">${options(STEP_SEQUENCE_NAMES)}</select></label>
        <label>Size <input type="number" min="${STEP_MIN_SIZE}" max="${STEP_MAX_SIZE}" step="1" aria-label="Step size"></label>
        <p class="qs-hint">Each new step takes the next label. Click a step to edit it.</p>
      </div>
      <label class="qs-font">Font size <input type="number" min="10" max="200" step="1" aria-label="Style font size"></label>
    </section>`
  const grid = root.querySelector<HTMLElement>('.qs-grid')!
  const color = createColorPicker(root.querySelector<HTMLElement>('.qs-color')!, value => apply({ color: value }))
  let activeColor = '#e5484d'
  const opacity = root.querySelector<HTMLInputElement>('.qs-opacity')!
  opacity.addEventListener('input', () => { root.querySelector('.qs-opacity-value')!.textContent = `${opacity.value}%` })
  opacity.addEventListener('change', () => apply({ color: activeColor.slice(0, 7) + Math.round(opacity.valueAsNumber / 100 * 255).toString(16).padStart(2, '0') }))
  const width = root.querySelector<HTMLInputElement>('[aria-label="Style line width"]')!
  const widthValue = root.querySelector<HTMLInputElement>('[aria-label="Line width value (pt)"]')!
  width.addEventListener('input', () => { widthValue.value = width.value })
  const font = root.querySelector<HTMLInputElement>('[aria-label="Style font size"]')!
  const stepShape = root.querySelector<HTMLSelectElement>('[aria-label="Step shape"]')!
  const stepSequence = root.querySelector<HTMLSelectElement>('[aria-label="Step type"]')!
  const stepSize = root.querySelector<HTMLInputElement>('[aria-label="Step size"]')!
  stepShape.addEventListener('change', () => apply({ stepShape: stepShape.value as StepShape }))
  stepSequence.addEventListener('change', () => apply({ stepSequence: stepSequence.value as StepSequence }))
  for (const [input, key] of [[width, 'strokeWidth'], [widthValue, 'strokeWidth'], [font, 'fontSize'], [stepSize, 'stepSize']] as const) {
    input.addEventListener('change', () => {
      if (!input.value || !input.checkValidity()) return
      apply({ [key]: input.valueAsNumber })
    })
  }
  let previousKind = ''
  return {
    update(state: EditorState) {
      const selected = currentDocument(state).annotations.find(a => a.id === state.selectedAnnotationId)
      const kind = selected?.kind ?? state.tool
      const active = kind !== 'crop' && kind !== 'blur'
      // A selected step carries its own shape, type and size under annotation names.
      const style = selected?.kind === 'step'
        ? { ...state.style, color: selected.color, stepShape: selected.shape, stepSequence: selected.sequence, stepSize: selected.size }
        : { ...state.style, ...selected }
      root.querySelector('.qs-context')!.textContent = `${kind[0]!.toUpperCase()}${kind.slice(1)} · ${selected ? 'Selected object' : 'New objects'}`
      root.querySelector<HTMLElement>('.qs-empty')!.hidden = active
      root.querySelector<HTMLElement>('.qs-properties')!.hidden = !active
      grid.hidden = !active
      if (previousKind !== kind) {
        previousKind = kind
        grid.replaceChildren()
        if (kind === 'step') grid.append(...stepPresetButtons(apply))
        else for (const weight of (kind === 'highlight' ? [3] : kind === 'box' ? BOX_PRESET_WIDTHS : kind === 'arrow' ? ARROW_PRESET_WIDTHS : [3, 6, 10])) for (const [name, hex] of COLORS) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'qs-preset'
          button.dataset.color = hex
          button.dataset.weight = String(weight)
          button.setAttribute('aria-label', kind === 'box' || kind === 'arrow' ? `${name} ${weight}px style` : `${name} ${weight === 3 ? 'thin' : weight === 6 ? 'medium' : 'thick'} style`)
          button.title = button.getAttribute('aria-label')!
          const stroke = weight / 3
          const mark = kind === 'callout'
            ? `<path d="M20 33L8 47" stroke="${hex}" stroke-width="${stroke + 2}"/><path d="M5 50L8 38L16 46Z" fill="${hex}"/><rect x="13" y="7" width="42" height="29" rx="5" fill="${hex}"/><text x="34" y="27" fill="${readableTextColor(hex)}">A</text>`
            : kind === 'arrow'
              ? `<path d="M10 42L49 12M34 12H49V27" fill="none" stroke="${hex}" stroke-width="${stroke + 1}"/>`
              : kind === 'text' ? `<text x="32" y="38" fill="${hex}" style="font-size:${24 + weight}px">A</text>`
                : `<rect x="10" y="12" width="44" height="30" rx="3" fill="${kind === 'highlight' ? hex : 'none'}" fill-opacity="0.45" stroke="${hex}" stroke-width="${stroke}"/>`
          button.innerHTML = `<svg viewBox="0 0 64 56" aria-hidden="true">${mark}</svg>`
          button.addEventListener('click', () => apply(kind === 'text'
            ? { color: hex, fontSize: weight === 3 ? 24 : weight === 6 ? 40 : 64 }
            : { color: hex, strokeWidth: weight }))
          grid.append(button)
        }
      }
      activeColor = style.color
      color.update(style.color)
      opacity.value = String(style.color.length === 9 ? Math.round(parseInt(style.color.slice(7), 16) / 255 * 100) : 100)
      root.querySelector('.qs-opacity-value')!.textContent = `${opacity.value}%`
      width.value = String(style.strokeWidth)
      widthValue.value = String(style.strokeWidth)
      font.value = String(style.fontSize)
      root.querySelector<HTMLElement>('.qs-width')!.hidden = !['box', 'arrow', 'callout'].includes(kind)
      root.querySelector<HTMLElement>('.qs-font')!.hidden = kind !== 'text'
      root.querySelector<HTMLElement>('.qs-auto')!.hidden = kind !== 'callout'
      root.querySelector<HTMLElement>('.qs-step')!.hidden = kind !== 'step'
      stepShape.value = style.stepShape
      stepSequence.value = style.stepSequence
      stepSize.value = String(Math.round(style.stepSize))
      for (const button of grid.querySelectorAll<HTMLButtonElement>('button')) {
        if (kind === 'step') {
          const matches = button.dataset.color === style.color
            && button.dataset.shape === style.stepShape
            && button.dataset.sequence === style.stepSequence
          button.setAttribute('aria-pressed', String(matches))
          continue
        }
        const weight = Number(button.dataset.weight)
        const matches = button.dataset.color === style.color && (kind === 'text'
          ? style.fontSize === (weight === 3 ? 24 : weight === 6 ? 40 : 64)
          : kind === 'highlight' || style.strokeWidth === weight)
        button.setAttribute('aria-pressed', String(matches))
      }
    },
  }
}
