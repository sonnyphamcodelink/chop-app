import { describe, expect, it } from 'vitest'
import {
  ATTACHMENT_MAX_BYTES,
  attachmentFileName,
  attachmentProblem,
  ATTACHMENTS_TOTAL_MAX_BYTES,
  formatBytes,
  RAW_PASTE_MAX_BYTES,
  MAX_ATTACHMENTS,
  parsePastedImage,
  parsePastedImages,
  type PastedImage,
  totalBytes,
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

describe('parsePastedImages', () => {
  it('accepts the first attachment using the normal byte limit', () => {
    const dataUrl = `data:image/png;base64,${PNG_BASE64}`

    expect(parsePastedImages([dataUrl])).toEqual([parsePastedImage(dataUrl)])
  })

  it('accepts multiple valid attachments in order', () => {
    const png = `data:image/png;base64,${PNG_BASE64}`
    const jpeg = `data:image/jpeg;base64,${PNG_BASE64}`

    expect(parsePastedImages([png, jpeg])?.map((image) => image.mediaType)).toEqual([
      'image/png',
      'image/jpeg',
    ])
  })

  it('rejects the complete list when any attachment is invalid', () => {
    expect(parsePastedImages([`data:image/png;base64,${PNG_BASE64}`, 'not-an-image'])).toBeNull()
  })

  it('rejects a list past the total byte limit', () => {
    const first = ofSize(ATTACHMENT_MAX_BYTES)
    const second = ofSize(ATTACHMENTS_TOTAL_MAX_BYTES - ATTACHMENT_MAX_BYTES + 1)

    expect(parsePastedImages([first, second])).toBeNull()
  })
})

describe('attachmentFileName', () => {
  it('names the file after the type it actually is', () => {
    expect(attachmentFileName('image/png', 0)).toBe('pasted-image-1.png')
    expect(attachmentFileName('image/jpeg', 0)).toBe('pasted-image-1.jpg')
    expect(attachmentFileName('image/gif', 0)).toBe('pasted-image-1.gif')
    expect(attachmentFileName('image/webp', 0)).toBe('pasted-image-1.webp')
  })

  it('numbers the files from one, the way the thumbnails read', () => {
    expect(attachmentFileName('image/png', 1)).toBe('pasted-image-2.png')
    expect(attachmentFileName('image/png', 2)).toBe('pasted-image-3.png')
  })

  it('falls back to png for a type it does not know', () => {
    expect(attachmentFileName('image/heic', 0)).toBe('pasted-image-1.png')
  })
})

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1_500_000)).toBe('1.4 MB')
  })
})

/** An image of a given decoded size, without building the base64 for it. */
function sized(byteLength: number): PastedImage {
  return { dataUrl: 'data:image/png;base64,AAAA', mediaType: 'image/png', byteLength }
}

describe('totalBytes', () => {
  it('is zero for nothing attached', () => {
    expect(totalBytes([])).toBe(0)
  })

  it('adds every image up', () => {
    expect(totalBytes([sized(100), sized(250)])).toBe(350)
  })
})

describe('attachmentProblem', () => {
  it('lets the first image through', () => {
    expect(attachmentProblem([], sized(1000))).toBeNull()
  })

  it('lets images through up to the limit', () => {
    const existing = Array.from({ length: MAX_ATTACHMENTS - 1 }, () => sized(1000))
    expect(attachmentProblem(existing, sized(1000))).toBeNull()
  })

  it('refuses one past the limit, and says how many are allowed', () => {
    const full = Array.from({ length: MAX_ATTACHMENTS }, () => sized(1000))
    expect(attachmentProblem(full, sized(1000))).toContain(String(MAX_ATTACHMENTS))
  })

  it('refuses an image that would take the set over the total cap', () => {
    const existing = [sized(ATTACHMENTS_TOTAL_MAX_BYTES - 10)]
    expect(attachmentProblem(existing, sized(11))).not.toBeNull()
  })

  it('allows a set that lands exactly on the total cap', () => {
    const existing = [sized(ATTACHMENTS_TOTAL_MAX_BYTES - 10)]
    expect(attachmentProblem(existing, sized(10))).toBeNull()
  })

  it('caps the total below what the per-image cap alone would allow', () => {
    // Otherwise three full-size images could be posted, which no mailbox takes.
    expect(ATTACHMENTS_TOTAL_MAX_BYTES).toBeLessThan(ATTACHMENT_MAX_BYTES * MAX_ATTACHMENTS)
  })
})

describe('parsePastedImage size gate', () => {
  it('measures against the default cap when none is given', () => {
    expect(parsePastedImage(ofSize(ATTACHMENT_MAX_BYTES + 3))).toBeNull()
  })

  it('takes a looser cap, for the gate that runs before an image is shrunk', () => {
    const big = ofSize(ATTACHMENT_MAX_BYTES + 3)
    expect(parsePastedImage(big, RAW_PASTE_MAX_BYTES)).not.toBeNull()
  })

  it('still refuses past the loose cap', () => {
    // Built from the length rather than the bytes: 64 MB of base64 is not worth
    // allocating to prove a comparison.
    const payload = 'A'.repeat((RAW_PASTE_MAX_BYTES / 3 + 4) * 4)
    expect(parsePastedImage(`data:image/png;base64,${payload}`, RAW_PASTE_MAX_BYTES)).toBeNull()
  })

  it('checks the media type whatever the cap', () => {
    expect(parsePastedImage('data:text/html;base64,AAAA', RAW_PASTE_MAX_BYTES)).toBeNull()
  })

  it('leaves the loose gate well above the strict one', () => {
    expect(RAW_PASTE_MAX_BYTES).toBeGreaterThan(ATTACHMENT_MAX_BYTES)
  })
})
