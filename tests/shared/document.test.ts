import { describe, expect, it } from 'vitest'
import {
  addAnnotation,
  type Annotation,
  createDocument,
  outputSize,
  parseDocument,
  removeAnnotation,
  serializeDocument,
  setCrop,
  updateAnnotation,
} from '@shared/document'

const box: Annotation = {
  id: 'a1',
  kind: 'box',
  rect: { x: 10, y: 10, width: 50, height: 40 },
  color: '#ff0000',
  strokeWidth: 3,
}

const arrow: Annotation = {
  id: 'a2',
  kind: 'arrow',
  from: { x: 0, y: 0 },
  to: { x: 100, y: 100 },
  color: '#00ff00',
  strokeWidth: 4,
}

describe('createDocument', () => {
  it('starts with no annotations and no crop', () => {
    const doc = createDocument('doc-1', 800, 600)
    expect(doc).toEqual({
      id: 'doc-1',
      width: 800,
      height: 600,
      scaleFactor: 1,
      cropRect: null,
      annotations: [],
    })
  })

  it('records the capture display scale factor', () => {
    expect(createDocument('doc-1', 800, 600, 2).scaleFactor).toBe(2)
  })
})

describe('addAnnotation', () => {
  it('appends without mutating the original document', () => {
    const doc = createDocument('doc-1', 800, 600)
    const next = addAnnotation(doc, box)
    expect(next.annotations).toEqual([box])
    expect(doc.annotations).toEqual([])
  })

  it('preserves insertion order, which is z-order', () => {
    const doc = addAnnotation(addAnnotation(createDocument('d', 10, 10), box), arrow)
    expect(doc.annotations.map((a) => a.id)).toEqual(['a1', 'a2'])
  })
})

describe('updateAnnotation', () => {
  it('replaces the matching annotation', () => {
    const doc = addAnnotation(createDocument('d', 800, 600), box)
    const next = updateAnnotation(doc, 'a1', (a) =>
      a.kind === 'box' ? { ...a, color: '#0000ff' } : a,
    )
    expect(next.annotations[0]).toMatchObject({ id: 'a1', color: '#0000ff' })
  })

  it('does not mutate the original annotation', () => {
    const doc = addAnnotation(createDocument('d', 800, 600), box)
    updateAnnotation(doc, 'a1', (a) => (a.kind === 'box' ? { ...a, color: '#0000ff' } : a))
    expect(doc.annotations[0]).toMatchObject({ color: '#ff0000' })
  })

  it('returns an equal document when the id is unknown', () => {
    const doc = addAnnotation(createDocument('d', 800, 600), box)
    expect(updateAnnotation(doc, 'missing', (a) => a).annotations).toEqual(doc.annotations)
  })
})

describe('removeAnnotation', () => {
  it('drops only the matching annotation', () => {
    const doc = addAnnotation(addAnnotation(createDocument('d', 10, 10), box), arrow)
    expect(removeAnnotation(doc, 'a1').annotations.map((a) => a.id)).toEqual(['a2'])
  })

  it('is a no-op for an unknown id', () => {
    const doc = addAnnotation(createDocument('d', 10, 10), box)
    expect(removeAnnotation(doc, 'nope').annotations).toHaveLength(1)
  })
})

describe('setCrop', () => {
  it('stores the crop rect', () => {
    const doc = setCrop(createDocument('d', 800, 600), { x: 10, y: 10, width: 100, height: 80 })
    expect(doc.cropRect).toEqual({ x: 10, y: 10, width: 100, height: 80 })
  })

  it('clears the crop when passed null, restoring full size', () => {
    const cropped = setCrop(createDocument('d', 800, 600), {
      x: 10, y: 10, width: 100, height: 80,
    })
    expect(outputSize(setCrop(cropped, null))).toEqual({ width: 800, height: 600 })
  })

  it('keeps annotations untouched, so uncropping restores their positions', () => {
    const doc = addAnnotation(createDocument('d', 800, 600), box)
    const cropped = setCrop(doc, { x: 0, y: 0, width: 100, height: 100 })
    expect(cropped.annotations).toEqual([box])
  })
})

describe('outputSize', () => {
  it('reports full size when uncropped', () => {
    expect(outputSize(createDocument('d', 800, 600))).toEqual({ width: 800, height: 600 })
  })

  it('reports crop size when cropped', () => {
    const doc = setCrop(createDocument('d', 800, 600), { x: 5, y: 5, width: 300, height: 200 })
    expect(outputSize(doc)).toEqual({ width: 300, height: 200 })
  })
})

describe('serializeDocument / parseDocument', () => {
  it('round-trips a document with annotations and a crop', () => {
    const doc = setCrop(
      addAnnotation(addAnnotation(createDocument('d', 800, 600), box), arrow),
      { x: 1, y: 2, width: 300, height: 200 },
    )
    expect(parseDocument(serializeDocument(doc))).toEqual(doc)
  })

  it('rejects malformed JSON with a descriptive error', () => {
    expect(() => parseDocument('{oops')).toThrow(/document/i)
  })

  it('rejects a payload missing required fields', () => {
    expect(() => parseDocument('{"id":"d"}')).toThrow(/document/i)
  })

  it('drops a malformed cropRect rather than trusting the file', () => {
    const payload = JSON.stringify({
      id: 'd', width: 10, height: 10,
      cropRect: { x: 'nope', y: 0, width: 5, height: 5 },
      annotations: [],
    })
    expect(parseDocument(payload).cropRect).toBeNull()
  })

  it('drops a non-finite cropRect', () => {
    const payload = '{"id":"d","width":10,"height":10,"cropRect":{"x":null,"y":0,"width":5,"height":5},"annotations":[]}'
    expect(parseDocument(payload).cropRect).toBeNull()
  })

  it('keeps a well-formed cropRect', () => {
    const payload = JSON.stringify({
      id: 'd', width: 10, height: 10,
      cropRect: { x: 1, y: 2, width: 3, height: 4 },
      annotations: [],
    })
    expect(parseDocument(payload).cropRect).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })

  it('drops annotations of an unknown kind rather than failing the whole load', () => {
    const payload = JSON.stringify({
      id: 'd',
      width: 10,
      height: 10,
      cropRect: null,
      annotations: [box, { id: 'x', kind: 'wormhole' }],
    })
    expect(parseDocument(payload).annotations.map((a) => a.id)).toEqual(['a1'])
  })

  it('defaults a missing scaleFactor to 1 for older documents', () => {
    const payload = JSON.stringify({
      id: 'd', width: 10, height: 10, cropRect: null, annotations: [],
    })
    expect(parseDocument(payload).scaleFactor).toBe(1)
  })

  it('preserves a stored scaleFactor on round-trip', () => {
    const doc = createDocument('d', 800, 600, 2)
    expect(parseDocument(serializeDocument(doc)).scaleFactor).toBe(2)
  })
})
