import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SETTINGS_PANES } from '../../src/shared/ipc'

const html = readFileSync(new URL('../../src/renderer/settings/index.html', import.meta.url), 'utf8')
const script = readFileSync(new URL('../../src/renderer/settings/license.ts', import.meta.url), 'utf8')

describe('Settings sidebar', () => {
  // showPane resolves `#pane-<id>` with a non-null assertion, so a name that
  // exists in one place and not the other is a crash rather than a mis-render.
  it('has a nav button and a section for every pane the app can ask for', () => {
    for (const pane of SETTINGS_PANES) {
      expect(html).toContain(`data-pane="${pane}"`)
      expect(html).toContain(`id="pane-${pane}"`)
    }
  })

  it('lists the panes in the order the sidebar shows them', () => {
    expect(SETTINGS_PANES).toEqual(['general', 'shortcuts', 'license', 'feedback'])
  })
})

describe('License pane markup', () => {
  it('carries every element the pane script reaches for', () => {
    const ids = [...script.matchAll(/querySelector<[^>]+>\('#([\w-]+)'\)/g)].map((match) => match[1])
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(html).toContain(`id="${id}"`)
  })

  it('keeps the key field selectable, against the app-wide user-select: none', () => {
    expect(html).toMatch(/#license-input \{[^}]*user-select: text/)
  })

  it('turns off the autocorrect a licence key would not survive', () => {
    expect(html).toContain('spellcheck="false"')
    expect(html).toContain('autocapitalize="off"')
  })
})

describe('License pane script', () => {
  it('hides the key entry only once a licence is actually in force', () => {
    // A trial or an expired key must still leave somewhere to paste one.
    expect(script).toContain("const licensed = view.status.kind === 'licensed'")
    expect(script).toContain('elements.entry.hidden = licensed')
  })

  it('clears every tone before applying the current one', () => {
    expect(script).toContain('elements.state.classList.remove(...TONES)')
  })

  it('redraws when the licence changes somewhere else', () => {
    expect(script).toContain('bridge.onLicenseChanged((view) => render(elements, view))')
  })

  it('claims a removal only when one actually happened', () => {
    // Main owns the confirmation, so a cancelled removal comes back as a normal
    // result; saying "the key was removed" there would be a lie.
    expect(script).toContain("if (result.removed) showStatus(elements, 'The key was removed")
  })

  it('leaves the buy URL to the main process rather than holding one', () => {
    expect(script).not.toContain('https://')
  })
})
