import { describe, expect, it } from 'vitest'
import { BLUR_SAMPLE_SIZE } from '@shared/constants'
import { addAnnotation, type Annotation, createDocument, setCrop } from '@shared/document'
import { type CanvasFactory, renderDocument } from '@shared/render'
import { beginDraft, documentWithDraft, updateDraft } from '@shared/tools'
import { createMockContext, type MockContext, opNames } from '../helpers/mock-context'

const image = {} as CanvasImageSource

function factory(): CanvasFactory {
  return () => {
    const { ctx } = createMockContext()
    return { canvas: {} as CanvasImageSource, ctx }
  }
}

/** A factory that keeps the offscreen surfaces it hands out, so they can be asserted on. */
function recordingFactory(): {
  readonly factory: CanvasFactory
  readonly created: readonly MockContext[]
} {
  const created: MockContext[] = []
  return {
    factory: () => {
      const mock = createMockContext()
      created.push(mock)
      return { canvas: {} as CanvasImageSource, ctx: mock.ctx }
    },
    created,
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

  it('snaps a fractional crop origin to whole pixels', () => {
    // A half-pixel offset lands the screenshot between pixels, and the
    // interpolation that follows softens every glyph in the export.
    const { ctx, ops } = createMockContext()
    const doc = setCrop(createDocument('d', 800, 600), {
      x: 137.4, y: 50.6, width: 300, height: 200,
    })
    renderDocument(ctx, image, doc, factory())
    expect(ops.find((op) => op.name === 'translate')?.args).toEqual([-137, -51])
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

  const blurRect = { x: 100, y: 50, width: BLUR_SAMPLE_SIZE * 4, height: BLUR_SAMPLE_SIZE * 4 }
  const blur: Annotation = { id: 'x', kind: 'blur', rect: blurRect }

  it('redacts a blur region by downsampling it to the sample grid', () => {
    const { ctx } = createMockContext()
    const { factory: recording, created } = recordingFactory()
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), blur), recording)

    // The region is read from the source image into a 4x4 surface: the detail
    // between those samples is gone, not merely spread around.
    const offscreen = created[0]
    expect(offscreen?.ops).toContainEqual({
      name: 'drawImage',
      args: [image, 100, 50, blurRect.width, blurRect.height, 0, 0, 4, 4],
    })
  })

  it('softens and washes the blur region white instead of leaving a mosaic', () => {
    const { ctx, ops } = createMockContext()
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), blur), factory())
    const names = opNames(ops)

    expect(ops).toContainEqual({ name: 'set:imageSmoothingEnabled', args: [true] })
    expect(ops.find((op) => op.name === 'set:filter')?.args[0]).toMatch(/^blur\(\d+px\)$/)
    expect(names).toContain('clip')
    expect(ops).toContainEqual({
      name: 'fillRect',
      args: [100, 50, blurRect.width, blurRect.height],
    })
    const wash = ops.find((op) => op.name === 'set:fillStyle')?.args[0] as string
    expect(wash).toMatch(/rgba\(255, 255, 255/)
  })

  it('clears the gaussian before the wash so the wash keeps hard edges', () => {
    const { ctx, ops } = createMockContext()
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), blur), factory())
    const filters = ops.filter((op) => op.name === 'set:filter').map((op) => op.args[0])
    expect(filters.at(-1)).toBe('none')
    const clearedAt = ops.findIndex((op) => op.name === 'set:filter' && op.args[0] === 'none')
    const washedAt = ops.findIndex((op) => op.name === 'fillRect')
    expect(clearedAt).toBeLessThan(washedAt)
  })

  it('paints the softened region past the clip so no original shows at the edges', () => {
    const { ctx, ops } = createMockContext()
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), blur), factory())
    const upscale = ops.filter((op) => op.name === 'drawImage').at(-1)!
    const [, , , , , dx, dy, dw, dh] = upscale.args as number[]
    expect(dx!).toBeLessThan(blurRect.x)
    expect(dy!).toBeLessThan(blurRect.y)
    expect(dw!).toBeGreaterThan(blurRect.width)
    expect(dh!).toBeGreaterThan(blurRect.height)
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

  it('fills a callout bubble and its tail in the annotation colour', () => {
    const { ctx, ops } = createMockContext()
    const callout: Annotation = {
      id: 'c', kind: 'callout',
      rect: { x: 40, y: 40, width: 200, height: 80 },
      tail: { x: 140, y: 200 },
      text: 'look here', color: '#ff3b30', fontSize: 18,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), callout), factory())
    expect(ops).toContainEqual({ name: 'set:fillStyle', args: ['#ff3b30'] })
    // The tail tip is drawn as part of a filled triangle.
    expect(ops).toContainEqual({ name: 'lineTo', args: [140, 200] })
    expect(opNames(ops).filter((name) => name === 'fill').length).toBeGreaterThanOrEqual(2)
  })

  it('draws callout text in a colour that contrasts with the bubble', () => {
    const { ctx, ops } = createMockContext()
    const callout: Annotation = {
      id: 'c', kind: 'callout',
      rect: { x: 0, y: 0, width: 400, height: 80 },
      tail: { x: 200, y: 160 },
      text: 'note', color: '#ffffff', fontSize: 18,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), callout), factory())
    expect(ops).toContainEqual({ name: 'set:fillStyle', args: ['#000000'] })
    expect(ops.find((op) => op.name === 'fillText')?.args[0]).toBe('note')
  })

  it('wraps callout text onto multiple lines when it will not fit', () => {
    const { ctx, ops } = createMockContext()
    // The mock measures one unit per character, so a narrow bubble forces a wrap.
    const callout: Annotation = {
      id: 'c', kind: 'callout',
      rect: { x: 0, y: 0, width: 30, height: 80 },
      tail: { x: 15, y: 160 },
      text: 'one two three four five', color: '#ff3b30', fontSize: 18,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), callout), factory())
    expect(ops.filter((op) => op.name === 'fillText').length).toBeGreaterThan(1)
  })

  it('draws no text for a callout with none, but still draws the bubble', () => {
    const { ctx, ops } = createMockContext()
    const callout: Annotation = {
      id: 'c', kind: 'callout',
      rect: { x: 0, y: 0, width: 100, height: 40 },
      tail: { x: 50, y: 80 },
      text: '', color: '#ff3b30', fontSize: 18,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), callout), factory())
    expect(opNames(ops)).toContain('fill')
    expect(opNames(ops)).not.toContain('fillText')
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
