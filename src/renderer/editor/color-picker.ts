const PALETTE = [
  ['Red', '#e5484d'], ['Orange', '#f0954d'], ['Yellow', '#f0c94d'],
  ['Green', '#4fb264'], ['Blue', '#4a8ff0'], ['Purple', '#9a6ff0'],
  ['Black', '#1c1c1e'], ['White', '#ffffff'], ['Transparent', '#ffffff00'],
] as const

export function createColorPicker(root: HTMLElement, apply: (color: string) => void) {
  root.innerHTML = `<button type="button" class="color-trigger" aria-label="Style color" popovertarget="color-popover"><span></span>⌄</button>
    <div id="color-popover" popover aria-label="Color picker">
      <div class="color-plane" tabindex="0" role="group" aria-label="Saturation and brightness"><i></i></div>
      <input class="color-hue" type="range" min="0" max="360" aria-label="Hue">
      <label class="color-alpha-label">Opacity <input class="color-alpha" type="range" min="0" max="100" aria-label="Color opacity"></label>
      <div class="color-fields"><label>Hex<input class="color-hex" aria-label="Hex color" maxlength="9"></label>
      ${['R', 'G', 'B', 'A'].map(channel => `<label>${channel}<input type="number" min="0" max="${channel === 'A' ? 100 : 255}" aria-label="${channel} color channel"></label>`).join('')}</div>
      <h3>Colors</h3><div class="color-palette"></div>
    </div>`
  const popover = root.querySelector<HTMLElement>('[popover]')!
  const trigger = root.querySelector<HTMLButtonElement>('button')!
  const plane = root.querySelector<HTMLElement>('.color-plane')!
  const hue = root.querySelector<HTMLInputElement>('.color-hue')!
  const alpha = root.querySelector<HTMLInputElement>('.color-alpha')!
  const hexInput = root.querySelector<HTMLInputElement>('.color-hex')!
  const channels = [...root.querySelectorAll<HTMLInputElement>('.color-fields input[type=number]')]
  let h = 0, s = 1, v = 1, opacity = 100
  let rgb = '#ff0000'
  function paint() {
    trigger.querySelector('span')!.setAttribute('style', `background:${rgb}${Math.round(opacity * 2.55).toString(16).padStart(2, '0')}`)
    plane.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${h} 100% 50%)`
    const marker = plane.querySelector<HTMLElement>('i')!
    marker.style.left = `${s * 100}%`; marker.style.top = `${(1 - v) * 100}%`
    hue.value = String(h); alpha.value = String(opacity)
    hexInput.value = rgb.toUpperCase()
    channels.forEach((input, index) => { input.value = String(index === 3 ? opacity : parseInt(rgb.slice(1 + index * 2, 3 + index * 2), 16)) })
  }
  function publish() {
    paint()
    apply(opacity === 100 ? rgb : `${rgb}${Math.round(opacity / 100 * 255).toString(16).padStart(2, '0')}`)
  }
  function update(color: string) {
    if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(color)) return
    rgb = color.slice(0, 7)
    opacity = color.length === 9 ? Math.round(parseInt(color.slice(7), 16) / 255 * 100) : 100
    const [r, g, b] = [1, 3, 5].map(i => parseInt(rgb.slice(i, i + 2), 16) / 255) as [number, number, number]
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
    v = max; s = max === 0 ? 0 : delta / max
    if (delta) h = ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60 + 360) % 360
    paint()
  }
  function fromHSV() {
    const c = v * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), m = v - c
    const parts = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x]
    rgb = '#' + parts.map(n => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('')
    paint()
  }
  function point(event: PointerEvent) {
    const rect = plane.getBoundingClientRect()
    s = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    v = 1 - Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))
    fromHSV()
  }
  plane.addEventListener('pointerdown', event => { plane.setPointerCapture(event.pointerId); point(event) })
  plane.addEventListener('pointermove', event => { if (plane.hasPointerCapture(event.pointerId)) point(event) })
  plane.addEventListener('pointerup', event => { point(event); plane.releasePointerCapture(event.pointerId); publish() })
  plane.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    s = Math.max(0, Math.min(1, s + (event.key === 'ArrowRight' ? .01 : event.key === 'ArrowLeft' ? -.01 : 0)))
    v = Math.max(0, Math.min(1, v + (event.key === 'ArrowUp' ? .01 : event.key === 'ArrowDown' ? -.01 : 0)))
    fromHSV(); publish()
  })
  hue.addEventListener('input', () => { h = hue.valueAsNumber; fromHSV() })
  hue.addEventListener('change', publish)
  alpha.addEventListener('input', () => { opacity = alpha.valueAsNumber; paint() })
  alpha.addEventListener('change', publish)
  hexInput.addEventListener('change', () => { if (/^#[\da-f]{6}([\da-f]{2})?$/i.test(hexInput.value)) { update(hexInput.value); publish() } else paint() })
  channels.forEach((input, index) => input.addEventListener('change', () => {
    if (!input.value || !input.checkValidity()) { paint(); return }
    if (index === 3) opacity = input.valueAsNumber
    else rgb = '#' + channels.slice(0, 3).map(c => Math.round(c.valueAsNumber).toString(16).padStart(2, '0')).join('')
    update(rgb + Math.round(opacity / 100 * 255).toString(16).padStart(2, '0')); publish()
  }))
  for (const [name, hex] of PALETTE) {
    const button = document.createElement('button')
    button.type = 'button'; button.title = name; button.setAttribute('aria-label', name)
    button.style.backgroundColor = hex
    button.addEventListener('click', () => { update(hex); publish() })
    root.querySelector('.color-palette')!.append(button)
  }
  popover.addEventListener('keydown', event => event.stopPropagation())
  return { update }
}
