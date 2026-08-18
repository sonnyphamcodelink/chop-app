import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_MAX_BYTES,
  attachmentFileName,
  formatBytes,
  parsePastedImage,
} from '../../../src/shared/feedback/attachment'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** A data URL whose payload decodes to exactly `bytes`, padding included. */
function ofSize(bytes: number, mediaType = 'image/png'): string {
  const whole = 'A'.repeat(Math.floor(bytes / 3) * 4)
  const tail = ['', 'AA==', 'AAA='][bytes % 3]
  return `data:${mediaType};base64,${whole}${tail}`
}

describe('parsePastedImage', () => {
  it('accepts a PNG and reports its decoded size', () => {
    const image = parsePastedImage(`data:image/png;base64,${PNG_BASE64}`)
    expect(image?.mediaType).toBe('image/png')
    expect(image?.byteLength).toBe(Buffer.from(PNG_BASE64, 'base64').byteLength)
  })

  it('accepts the other image types a clipboard hands over', () => {
    for (const type of ['image/jpeg', 'image/gif', 'image/webp']) {
      expect(parsePastedImage(`data:${type};base64,AAAA`)?.mediaType).toBe(type)
    }
  })

  it('refuses anything that is not a string', () => {
    expect(parsePastedImage(null)).toBeNull()
    expect(parsePastedImage(42)).toBeNull()
  })

  it('refuses a media type Chop does not send', () => {
    expect(parsePastedImage('data:image/svg+xml;base64,AAAA')).toBeNull()
    expect(parsePastedImage('data:text/html;base64,AAAA')).toBeNull()
    expect(parsePastedImage('data:application/pdf;base64,AAAA')).toBeNull()
  })

  it('refuses a URL that is not a base64 data URL at all', () => {
    expect(parsePastedImage('https://example.com/cat.png')).toBeNull()
    expect(parsePastedImage('data:image/png,notbase64')).toBeNull()
  })

  it('refuses a payload that is not valid base64', () => {
    expect(parsePastedImage('data:image/png;base64,AA')).toBeNull()
    expect(parsePastedImage('data:image/png;base64,AA*A')).toBeNull()
  })

  it('refuses an empty payload', () => {
    expect(parsePastedImage('data:image/png;base64,')).toBeNull()
  })

  it('accepts an image at exactly the cap', () => {
    expect(parsePastedImage(ofSize(ATTACHMENT_MAX_BYTES))?.byteLength).toBe(ATTACHMENT_MAX_BYTES)
  })

  it('refuses an image over the cap', () => {
    expect(parsePastedImage(ofSize(ATTACHMENT_MAX_BYTES + 3))).toBeNull()
  })

  it('reads padding as bytes that are not there', () => {
    // "AAAA" is 3 bytes, "AAA=" is 2, "AA==" is 1.
    expect(parsePastedImage('data:image/png;base64,AAAA')?.byteLength).toBe(3)
    expect(parsePastedImage('data:image/png;base64,AAA=')?.byteLength).toBe(2)
    expect(parsePastedImage('data:image/png;base64,AA==')?.byteLength).toBe(1)
  })
})

describe('attachmentFileName', () => {
  it('names the file after the type it actually is', () => {
    expect(attachmentFileName('image/png')).toBe('pasted-image.png')
    expect(attachmentFileName('image/jpeg')).toBe('pasted-image.jpg')
    expect(attachmentFileName('image/gif')).toBe('pasted-image.gif')
    expect(attachmentFileName('image/webp')).toBe('pasted-image.webp')
  })

  it('falls back to png for a type it does not know', () => {
    expect(attachmentFileName('image/heic')).toBe('pasted-image.png')
  })
})

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1_500_000)).toBe('1.4 MB')
  })
})
