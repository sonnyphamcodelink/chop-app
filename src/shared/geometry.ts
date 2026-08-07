import { MIN_SELECTION_DIMENSION } from './constants'

export type Point = { readonly x: number; readonly y: number }

export type Size = { readonly width: number; readonly height: number }

export type Rect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  )
}

export function rectIntersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

export function clampRect(rect: Rect, bounds: Rect): Rect {
  return rectIntersect(rect, bounds) ?? { x: rect.x, y: rect.y, width: 0, height: 0 }
}

export function rectArea(rect: Rect): number {
  return rect.width * rect.height
}

export function isDegenerateRect(rect: Rect): boolean {
  return rect.width < MIN_SELECTION_DIMENSION || rect.height < MIN_SELECTION_DIMENSION
}

export function offsetRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy }
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}
