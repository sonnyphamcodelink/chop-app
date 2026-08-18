import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const script = readFileSync(
  new URL('../../src/renderer/settings/image-compress.ts', import.meta.url),
  'utf8',
)

describe('image compression', () => {
  it('encodes to WebP, which keeps alpha unlike JPEG', () => {
    expect(script).toContain("const ENCODE_TYPE = 'image/webp'")
  })

  it('keeps quality high, since the format change is where the saving is', () => {
    const quality = /const ENCODE_QUALITY = ([\d.]+)/.exec(script)?.[1]
    expect(Number(quality)).toBeGreaterThanOrEqual(0.85)
  })

  it('leaves a GIF alone rather than flattening it to one frame', () => {
    expect(script).toContain("if (image.mediaType === 'image/gif') return image")
  })

  it('keeps the original when the re-encode saved nothing', () => {
    expect(script).toContain('reduced.byteLength >= image.byteLength) return image')
  })

  it('keeps the original when the canvas would not produce WebP', () => {
    expect(script).toContain('if (!encoded.startsWith(`data:${ENCODE_TYPE};base64,`)) return image')
  })

  it('draws through the stepped path rather than one big reduction', () => {
    expect(script).toContain('drawThrough(source, steps.length > 0 ? steps : [to])')
    expect(script).toContain("context.imageSmoothingQuality = 'high'")
  })

  it('never throws, so a bad paste cannot take the pane down', () => {
    // Every exit is a return, and the loader resolves rather than rejects.
    expect(script).not.toContain('throw ')
    expect(script).toContain('element.onerror = () => resolve(null)')
  })
})
