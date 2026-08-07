import { describe, expect, it } from 'vitest'
import { drawResizeHandle } from '../../src/renderer/editor/canvas-view'
import { createMockContext } from '../helpers/mock-context'

describe('drawResizeHandle', () => {
  it('draws a small white circle with a black one-pixel border', () => {
    const { ctx, ops } = createMockContext()

    drawResizeHandle(ctx, { x: 20, y: 30 }, 0.5)

    expect(ops).toContainEqual({ name: 'set:fillStyle', args: ['#ffffff'] })
    expect(ops).toContainEqual({ name: 'set:strokeStyle', args: ['#000000'] })
    expect(ops).toContainEqual({ name: 'set:lineWidth', args: [2] })
    // 7 CSS px across at 0.5 CSS px per image pixel => radius 7 image px.
    expect(ops).toContainEqual({
      name: 'arc',
      args: [20, 30, 7, 0, Math.PI * 2],
    })
    expect(ops).toContainEqual({ name: 'fill', args: [] })
    expect(ops).toContainEqual({ name: 'stroke', args: [] })
  })
})
