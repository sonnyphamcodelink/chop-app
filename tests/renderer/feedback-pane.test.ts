import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync(new URL('../../src/renderer/settings/index.html', import.meta.url), 'utf8')
const script = readFileSync(new URL('../../src/renderer/settings/feedback.ts', import.meta.url), 'utf8')

describe('Feedback pane markup', () => {
  it('carries every element the pane script reaches for', () => {
    const ids = [...script.matchAll(/querySelector<[^>]+>\('#([\w-]+)'\)/g)].map((match) => match[1])
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(html).toContain(`id="${id}"`)
  })

  it('keeps the message box selectable, against the app-wide user-select: none', () => {
    expect(html).toMatch(/#feedback-message \{[^}]*user-select: text/)
  })

  it('leaves spellcheck on, unlike the licence key field', () => {
    expect(html).toContain('id="feedback-message" rows="5" spellcheck="true"')
  })

  it('offers both kinds as one radio group', () => {
    expect(html).toContain('data-kind="idea"')
    expect(html).toContain('data-kind="problem"')
    expect(html).toContain('role="radiogroup"')
  })

  it('ticks diagnostics by default', () => {
    expect(html).toMatch(/id="feedback-diagnostics" type="checkbox" checked/)
  })

  it('gives each kind an icon of its own', () => {
    const icons = [...html.matchAll(/class="kind-icon"/g)]
    expect(icons).toHaveLength(2)
  })

  it('tells the user they can paste an image in', () => {
    expect(html).toContain('id="feedback-paste-hint"')
    expect(html).toContain('Paste a screenshot straight into the box')
  })

  it('hides the thumbnail strip and the fallbacks until there is a reason for them', () => {
    expect(html).toContain('id="feedback-images" class="thumbs" hidden')
    expect(html).toContain('id="feedback-copy" type="button" hidden')
    expect(html).toContain('id="feedback-email" type="button" hidden')
  })

  it('lays the thumbnails out as a strip, which is all the pane has height for', () => {
    expect(html).toMatch(/\.thumbs \{[^}]*display: flex/)
  })

  it('says images are shrunk, which explains a surprisingly small size', () => {
    expect(html).toContain('shrunk before they travel')
  })

  it('warns that a pasted image can hold anything that was on screen', () => {
    expect(html).toContain('hold anything that was on your screen')
    expect(html).toContain('have a look at the thumbnail')
  })
})

describe('Feedback pane script', () => {
  it('drops the saved draft only after a send has succeeded', () => {
    const sent = script.indexOf("if (result.status === 'sent')")
    expect(sent).toBeGreaterThan(-1)
    expect(script.slice(sent)).toContain('writeDraft(null)')
    // Nothing before the success branch may clear it.
    expect(script.slice(0, sent)).not.toContain('writeDraft(null)')
  })

  it('treats a cancelled confirmation as neither a send nor a failure', () => {
    const cancelled = script.slice(script.indexOf("if (result.status === 'cancelled')"))
    expect(cancelled).toContain('showStatus(IDLE_HINT)')
    expect(cancelled.slice(0, cancelled.indexOf('}'))).not.toContain('showFallbacks(true)')
  })

  it('never clears the message box inside send, however the send goes', () => {
    // Only `reset`, behind Send another, is allowed to empty the box.
    const send = script.slice(
      script.indexOf('async function send()'),
      script.indexOf('async function copyToClipboard()'),
    )
    expect(send.length).toBeGreaterThan(0)
    expect(send).not.toContain('elements.message.value =')
  })

  it('offers the fallbacks only once a send has actually failed', () => {
    expect(script).toContain('showFallbacks(false)')
    expect(script).toContain('showFallbacks(true)')
  })

  it('sends exactly the images that were pasted, in order', () => {
    expect(script).toContain('attachments: images.map((item) => item.dataUrl)')
  })

  it('shrinks a pasted image before the size caps are applied to it', () => {
    const attach = script.slice(script.indexOf('async function attach('))
    const body = attach.slice(0, attach.indexOf('\n  }'))
    // Loose gate, then the canvas, then the strict gate against what is sent.
    expect(body.indexOf('RAW_PASTE_MAX_BYTES')).toBeLessThan(
      body.indexOf('compressPastedImage(raw)'),
    )
    expect(body.indexOf('compressPastedImage(raw)')).toBeLessThan(
      body.indexOf('parsePastedImage(reduced.dataUrl)'),
    )
  })

  it('refuses an image past the count or the total size before showing it', () => {
    expect(script).toContain('attachmentProblem(images, parsed)')
    const paste = script.slice(script.indexOf('attachmentProblem(images, parsed)'))
    // The refusal has to come before the thumbnail is drawn.
    expect(paste.indexOf('showStatus(problem, true)')).toBeLessThan(
      paste.indexOf('showImages([...images, parsed])'),
    )
  })

  it('keeps the earlier images when another is pasted', () => {
    expect(script).toContain('showImages([...images, parsed])')
  })

  it('sends the reduced image, never the one that arrived', () => {
    const attach = script.slice(script.indexOf('async function attach('))
    const body = attach.slice(0, attach.indexOf('\n  }'))
    expect(body).toContain('showImages([...images, parsed])')
    expect(body).not.toContain('showImages([...images, raw])')
  })

  it('checks a pasted image before it ever becomes the attachment', () => {
    expect(script).toContain('parsePastedImage(dataUrl, RAW_PASTE_MAX_BYTES)')
    expect(script).toContain('showStatus(IMAGE_REFUSED, true)')
  })

  it('gives every thumbnail its own remove control', () => {
    expect(script).toContain('showImages(images.filter((_, at) => at !== index))')
    expect(script).toContain("remove.setAttribute('aria-label', `Remove image ${index + 1}`)")
  })

  it('tells the user how many more images they can paste', () => {
    expect(script).toContain('MAX_ATTACHMENTS - images.length')
  })

  it('keeps the image out of the saved draft, which has a storage quota', () => {
    const write = script.slice(script.indexOf('function writeDraft'))
    expect(write.slice(0, write.indexOf('\n}'))).not.toContain('dataUrl')
  })

  it('leaves the mail address to the main process rather than holding one', () => {
    expect(script).not.toContain('mailto:')
    expect(script).not.toContain('@chop.asia')
  })

  it('guards against a second send while one is in flight', () => {
    expect(script).toContain('if (sending) return')
  })
})
