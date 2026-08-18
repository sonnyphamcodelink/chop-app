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

  it('hides the image row and the fallbacks until there is a reason for them', () => {
    expect(html).toContain('id="feedback-image" class="attach" hidden')
    expect(html).toContain('id="feedback-copy" type="button" hidden')
    expect(html).toContain('id="feedback-email" type="button" hidden')
  })

  it('warns that a pasted image can hold anything that was on screen', () => {
    expect(html).toContain('A pasted image can')
    expect(html).toContain('hold anything that was on your screen')
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

  it('attaches nothing unless an image was actually pasted', () => {
    expect(script).toContain('attachment: image?.dataUrl ?? null')
  })

  it('checks a pasted image before it ever becomes the attachment', () => {
    expect(script).toContain('parsePastedImage(dataUrl)')
    expect(script).toContain('showStatus(IMAGE_REFUSED, true)')
  })

  it('lets the user take a pasted image back off', () => {
    expect(script).toContain("elements.imageRemove.addEventListener('click'")
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
