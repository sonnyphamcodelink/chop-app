import { isDegenerateRect, normalizeRect, type Point, type Rect } from '@shared/geometry'
import type { OverlayInit, OverlaySelection } from '@shared/ipc'
import { windowAtPoint, type WindowRect } from '@shared/window-rect'

type OverlayBridge = {
  onInit(handler: (init: OverlayInit) => void): void
  select(selection: OverlaySelection): void
  cancel(): void
}

const bridge = (window as unknown as { chopOverlay: OverlayBridge }).chopOverlay

const frozen = document.querySelector<HTMLImageElement>('#frozen')!
const cutout = document.querySelector<HTMLDivElement>('#cutout')!
const label = document.querySelector<HTMLDivElement>('#label')!
const veil = document.querySelector<HTMLDivElement>('#veil')!
const hint = document.querySelector<HTMLDivElement>('#hint')!
const inputLayer = document.querySelector<HTMLDivElement>('#input-layer')!
const crossX = document.querySelector<HTMLDivElement>('#cross-x')!
const crossY = document.querySelector<HTMLDivElement>('#cross-y')!

let state: OverlayInit | null = null
let dragOrigin: Point | null = null
let currentRect: Rect | null = null

/** Matches --guide in the stylesheet; the guides straddle the pointer. */
const GUIDE_THICKNESS = 2

function moveCrosshair(point: Point): void {
  crossX.style.display = 'block'
  crossY.style.display = 'block'
  crossX.style.top = `${point.y - GUIDE_THICKNESS / 2}px`
  crossY.style.left = `${point.x - GUIDE_THICKNESS / 2}px`
}

function hideCrosshair(): void {
  crossX.style.display = 'none'
  crossY.style.display = 'none'
}

function showRect(rect: Rect, caption: string, kind: 'window' | 'region'): void {
  currentRect = rect
  veil.style.display = 'none'
  cutout.classList.toggle('window', kind === 'window')
  cutout.style.display = 'block'
  cutout.style.left = `${rect.x}px`
  cutout.style.top = `${rect.y}px`
  cutout.style.width = `${rect.width}px`
  cutout.style.height = `${rect.height}px`

  label.style.display = 'block'
  label.textContent = caption
  // Keep the label inside the viewport when the selection hugs an edge.
  const below = rect.y + rect.height + 8
  label.style.left = `${Math.min(rect.x, window.innerWidth - 120)}px`
  label.style.top = `${below + 24 > window.innerHeight ? rect.y - 26 : below}px`
}

function clearRect(): void {
  currentRect = null
  veil.style.display = 'block'
  cutout.style.display = 'none'
  label.style.display = 'none'
}

function highlightWindowAt(point: Point): void {
  if (!state) return
  const hit: WindowRect | null = windowAtPoint(state.windows, point)
  if (!hit) {
    clearRect()
    return
  }
  showRect(
    hit.bounds,
    `${hit.app} · ${Math.round(hit.bounds.width)}×${Math.round(hit.bounds.height)}`,
    'window'
  )
}

function commit(rect: Rect, source: 'region' | 'window'): void {
  if (!state) return
  bridge.select({ displayId: state.display.id, rect, source })
}

bridge.onInit((init) => {
  state = init
  frozen.src = init.dataUrl
})

function pointerPoint(event: PointerEvent): Point {
  return { x: event.clientX, y: event.clientY }
}

inputLayer.addEventListener('pointermove', (event) => {
  event.preventDefault()
  const point = pointerPoint(event)
  moveCrosshair(point)
  if (!dragOrigin) {
    highlightWindowAt(point)
    return
  }
  hint.style.display = 'none'
  const rect = normalizeRect(dragOrigin, point)
  showRect(rect, `${Math.round(rect.width)} × ${Math.round(rect.height)}`, 'region')
})

inputLayer.addEventListener('pointerenter', (event) => {
  moveCrosshair(pointerPoint(event))
})

inputLayer.addEventListener('pointerleave', () => {
  if (dragOrigin) return
  hideCrosshair()
  clearRect()
})

inputLayer.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary) return
  event.preventDefault()
  inputLayer.setPointerCapture(event.pointerId)
  dragOrigin = pointerPoint(event)
  moveCrosshair(dragOrigin)
})

inputLayer.addEventListener('pointerup', (event) => {
  if (event.button !== 0 || !event.isPrimary || !dragOrigin) return
  event.preventDefault()
  if (inputLayer.hasPointerCapture(event.pointerId)) {
    inputLayer.releasePointerCapture(event.pointerId)
  }
  const point = pointerPoint(event)
  const rect = normalizeRect(dragOrigin, point)
  dragOrigin = null

  // A drag too small to be a region is a click: take the window underneath.
  if (isDegenerateRect(rect)) {
    highlightWindowAt(point)
    if (currentRect) commit(currentRect, 'window')
    return
  }
  commit(rect, 'region')
})

inputLayer.addEventListener('pointercancel', () => {
  dragOrigin = null
  hideCrosshair()
  clearRect()
})

frozen.addEventListener('dragstart', (event) => event.preventDefault())

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') bridge.cancel()
})

// A display that never receives focus still needs Escape to work.
window.addEventListener('blur', () => {
  hideCrosshair()
  clearRect()
})
