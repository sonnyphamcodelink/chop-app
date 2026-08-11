import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const html = readFileSync(new URL('../../src/renderer/settings/index.html', import.meta.url), 'utf8')
const script = readFileSync(new URL('../../src/renderer/settings/main.ts', import.meta.url), 'utf8')

describe('Settings page login controls', () => {
  it('keeps row label growth from stretching the switch', () => {
    expect(html).toContain('.row > label:first-of-type { flex: 1; }')
    expect(html).not.toContain('.row label { flex: 1; }')
  })

  it('honors hidden elements even when their class sets display', () => {
    expect(html).toContain('[hidden] { display: none !important; }')
  })

  it('disables and clears unsupported login state before re-enabling supported state', () => {
    expect(script).toMatch(
      /if \(state === 'unsupported'\) \{[\s\S]*loginSwitch\.checked = false[\s\S]*loginSwitch\.disabled = true/,
    )
    expect(script).toMatch(
      /loginRow\.hidden = false[\s\S]*loginSwitch\.disabled = false[\s\S]*loginSwitch\.checked = state === 'enabled'/,
    )
  })
})
