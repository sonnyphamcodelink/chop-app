import { describe, expect, it } from 'vitest'
import { PIXELATE_BLOCK_SIZE } from '@shared/constants'
import { addAnnotation, type Annotation, createDocument, setCrop } from '@shared/document'
import { type CanvasFactory, renderDocument } from '@shared/render'
import { beginDraft, documentWithDraft, updateDraft } from '@shared/tools'
import { createMockContext, opNames } from '../helpers/mock-context'

const image = {} as CanvasImageSource

function factory(): CanvasFactory {
  return () => {
    const { ctx } = createMockContext()
    return { canvas: {} as CanvasImageSource, ctx }
  }
}

describe('renderDocument', () => {
  it('draws the source image first', () => {
    const { ctx, ops } = createMockContext()
    renderDocument(ctx, image, createDocument('d', 800, 600), factory())
    expect(ops[0]?.name).toBe('save')
    expect(opNames(ops)).toContain('drawImage')
  })

  it('translates by the negative crop origin so annotations stay aligned', () => {
    const { ctx, ops } = createMockContext()
    const doc = setCrop(createDocument('d', 800, 600), {
      x: 100, y: 50, width: 300, height: 200,
    })
    renderDocument(ctx, image, doc, factory())
    expect(ops.find((op) => op.name === 'translate')?.args).toEqual([-100, -50])
  })

  it('strokes a box with its colour and width', () => {
    const { ctx, ops } = createMockContext()
    const box: Annotation = {
      id: 'b', kind: 'box',
      rect: { x: 10, y: 10, width: 50, height: 40 },
      color: '#ff0000', strokeWidth: 3,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), box), factory())
    expect(ops).toContainEqual({ name: 'set:strokeStyle', args: ['#ff0000'] })
    expect(ops).toContainEqual({ name: 'set:lineWidth', args: [3] })
    expect(ops).toContainEqual({ name: 'strokeRect', args: [10, 10, 50, 40] })
  })

  it('draws an arrow as a line plus a filled head', () => {
    const { ctx, ops } = createMockContext()
    const arrow: Annotation = {
      id: 'a', kind: 'arrow',
      from: { x: 0, y: 0 }, to: { x: 100, y: 0 },
      color: '#00ff00', strokeWidth: 4,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), arrow), factory())
    const names = opNames(ops)
    expect(names).toContain('stroke')
    expect(names).toContain('fill')
  })

  it('uses multiply compositing for the highlighter so text stays readable', () => {
    const { ctx, ops } = createMockContext()
    const highlight: Annotation = {
      id: 'h', kind: 'highlight',
      rect: { x: 0, y: 0, width: 100, height: 20 }, color: '#ffff00',
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), highlight), factory())
    expect(ops).toContainEqual({ name: 'set:globalCompositeOperation', args: ['multiply'] })
  })

  it('pixelates blur regions with smoothing disabled, never a gaussian', () => {
    const { ctx, ops } = createMockContext()
    const blur: Annotation = {
      id: 'x', kind: 'blur',
      rect: { x: 0, y: 0, width: PIXELATE_BLOCK_SIZE * 4, height: PIXELATE_BLOCK_SIZE * 4 },
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), blur), factory())
    expect(ops).toContainEqual({ name: 'set:imageSmoothingEnabled', args: [false] })
    expect(opNames(ops).filter((name) => name === 'drawImage').length).toBeGreaterThan(1)
  })

  it('draws text with its colour and font size', () => {
    const { ctx, ops } = createMockContext()
    const text: Annotation = {
      id: 't', kind: 'text',
      at: { x: 20, y: 30 }, text: 'hello', color: '#0000ff', fontSize: 18,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), text), factory())
    expect(ops).toContainEqual({ name: 'set:fillStyle', args: ['#0000ff'] })
    expect(ops.find((op) => op.name === 'fillText')?.args[0]).toBe('hello')
  })

  it('renders annotations in document order', () => {
    const { ctx, ops } = createMockContext()
    const first: Annotation = {
      id: '1', kind: 'box', rect: { x: 0, y: 0, width: 1, height: 1 },
      color: '#111111', strokeWidth: 1,
    }
    const second: Annotation = { ...first, id: '2', color: '#222222' }
    const doc = addAnnotation(addAnnotation(createDocument('d', 10, 10), first), second)
    renderDocument(ctx, image, doc, factory())
    const colours = ops
      .filter((op) => op.name === 'set:strokeStyle')
      .map((op) => op.args[0])
    expect(colours).toEqual(['#111111', '#222222'])
  })

  it('balances every save with a restore', () => {
    const { ctx, ops } = createMockContext()
    const doc = addAnnotation(createDocument('d', 10, 10), {
      id: 'h', kind: 'highlight',
      rect: { x: 0, y: 0, width: 5, height: 5 }, color: '#ff0',
    })
    renderDocument(ctx, image, doc, factory())
    const names = opNames(ops)
    expect(names.filter((n) => n === 'save').length).toBe(
      names.filter((n) => n === 'restore').length,
    )
  })

  it('paints a draft box on top when the document includes documentWithDraft', () => {
    const { ctx, ops } = createMockContext()
    const style = { color: '#ff3b30', strokeWidth: 3, fontSize: 18 }
    const draft = updateDraft(beginDraft('box', { x: 10, y: 10 }), { x: 110, y: 90 })
    const doc = documentWithDraft(createDocument('d', 800, 600), draft, style)
    renderDocument(ctx, image, doc, factory())
    expect(ops).toContainEqual({ name: 'strokeRect', args: [10, 10, 100, 80] })
    const imageIdx = ops.findIndex((op) => op.name === 'drawImage')
    const strokeIdx = ops.findIndex((op) => op.name === 'strokeRect')
    expect(imageIdx).toBeGreaterThanOrEqual(0)
    expect(strokeIdx).toBeGreaterThan(imageIdx)
  })
})
