import type { EditorState } from '@shared/editor-state'
import { currentDocument } from '@shared/editor-state'
import { readableTextColor } from '@shared/callout'
import type { ToolStyle } from '@shared/tools'
import { createColorPicker } from './color-picker'
import { STROKE_WIDTH_MIN, STROKE_WIDTH_MAX } from '@shared/constants'

/** Box preset rows, top to bottom. */
const BOX_PRESET_WIDTHS = [6, 10, 15] as const

const COLORS = [
  ['Red', '#e5484d'], ['Green', '#4fb264'], ['Blue', '#4a8ff0'], ['Yellow', '#f0c94d'],
] as const

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
  for (const [input, key] of [[width, 'strokeWidth'], [widthValue, 'strokeWidth'], [font, 'fontSize']] as const) {
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
      const style = { ...state.style, ...selected }
      root.querySelector('.qs-context')!.textContent = `${kind[0]!.toUpperCase()}${kind.slice(1)} · ${selected ? 'Selected object' : 'New objects'}`
      root.querySelector<HTMLElement>('.qs-empty')!.hidden = active
      root.querySelector<HTMLElement>('.qs-properties')!.hidden = !active
      grid.hidden = !active
      if (previousKind !== kind) {
        previousKind = kind
        grid.replaceChildren()
        for (const weight of (kind === 'highlight' ? [3] : kind === 'box' ? BOX_PRESET_WIDTHS : [3, 6, 10])) for (const [name, hex] of COLORS) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'qs-preset'
          button.dataset.color = hex
          button.dataset.weight = String(weight)
          button.setAttribute('aria-label', kind === 'box' ? `${name} ${weight}px style` : `${name} ${weight === 3 ? 'thin' : weight === 6 ? 'medium' : 'thick'} style`)
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
      for (const button of grid.querySelectorAll<HTMLButtonElement>('button')) {
        const weight = Number(button.dataset.weight)
        const matches = button.dataset.color === style.color && (kind === 'text'
          ? style.fontSize === (weight === 3 ? 24 : weight === 6 ? 40 : 64)
          : kind === 'highlight' || style.strokeWidth === weight)
        button.setAttribute('aria-pressed', String(matches))
      }
    },
  }
}
