import { describe, expect, it } from 'vitest'
import {
  acceleratorFromEvent,
  acceleratorProblem,
  DEFAULT_CAPTURE_SHORTCUT,
  formatAccelerator,
  formatModifiers,
  type KeyChordEvent,
  modifiersFromEvent,
  problemMessage,
} from '../../src/shared/accelerator'

const event = (overrides: Partial<KeyChordEvent> = {}): KeyChordEvent => ({
  code: 'Digit2',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
})

describe('DEFAULT_CAPTURE_SHORTCUT', () => {
  it('uses a cross-platform modifier', () => {
    expect(DEFAULT_CAPTURE_SHORTCUT).toBe('CommandOrControl+Shift+2')
  })

  it('is a shortcut the app would accept from the user', () => {
    expect(acceleratorProblem(DEFAULT_CAPTURE_SHORTCUT)).toBeNull()
  })
})

describe('acceleratorFromEvent', () => {
  it('reads the Command key on macOS', () => {
    expect(acceleratorFromEvent(event({ metaKey: true, shiftKey: true }), 'darwin')).toBe(
      'Shift+Command+2',
    )
  })

  it('reads the Windows key as Super off macOS', () => {
    expect(acceleratorFromEvent(event({ metaKey: true, code: 'KeyA' }), 'win32')).toBe(
      'Super+A',
    )
  })

  it('orders modifiers the same way regardless of press order', () => {
    const chord = { ctrlKey: true, altKey: true, shiftKey: true, metaKey: true }
    expect(acceleratorFromEvent(event({ ...chord, code: 'KeyQ' }), 'darwin')).toBe(
      'Control+Alt+Shift+Command+Q',
    )
  })

  it('names letter, digit and function keys the way Electron does', () => {
    expect(acceleratorFromEvent(event({ ctrlKey: true, code: 'KeyZ' }), 'linux')).toBe(
      'Control+Z',
    )
    expect(acceleratorFromEvent(event({ ctrlKey: true, code: 'Digit7' }), 'linux')).toBe(
      'Control+7',
    )
    expect(acceleratorFromEvent(event({ ctrlKey: true, code: 'F5' }), 'linux')).toBe(
      'Control+F5',
    )
  })

  it('maps named and punctuation keys', () => {
    expect(acceleratorFromEvent(event({ metaKey: true, code: 'Enter' }), 'darwin')).toBe(
      'Command+Return',
    )
    expect(acceleratorFromEvent(event({ metaKey: true, code: 'ArrowUp' }), 'darwin')).toBe(
      'Command+Up',
    )
    expect(acceleratorFromEvent(event({ metaKey: true, code: 'Slash' }), 'darwin')).toBe(
      'Command+/',
    )
    expect(acceleratorFromEvent(event({ metaKey: true, code: 'Numpad4' }), 'darwin')).toBe(
      'Command+num4',
    )
  })

  it('ignores a modifier pressed on its own', () => {
    expect(acceleratorFromEvent(event({ metaKey: true, code: 'MetaLeft' }), 'darwin')).toBeNull()
    expect(acceleratorFromEvent(event({ shiftKey: true, code: 'ShiftRight' }), 'darwin')).toBeNull()
  })

  it('ignores keys Electron cannot express', () => {
    expect(acceleratorFromEvent(event({ metaKey: true, code: 'Lang1' }), 'darwin')).toBeNull()
  })

  it('leaves Escape free for cancelling the recorder', () => {
    expect(acceleratorFromEvent(event({ metaKey: true, code: 'Escape' }), 'darwin')).toBeNull()
  })
})

describe('modifiersFromEvent', () => {
  it('lists held modifiers even with no key to go with them', () => {
    expect(
      modifiersFromEvent(event({ metaKey: true, shiftKey: true, code: 'MetaLeft' }), 'darwin'),
    ).toEqual(['Shift', 'Command'])
  })

  it('is empty when nothing is held', () => {
    expect(modifiersFromEvent(event(), 'darwin')).toEqual([])
  })
})

describe('formatModifiers', () => {
  it('runs macOS glyphs together', () => {
    expect(formatModifiers(['Shift', 'Command'], 'darwin')).toBe('⇧⌘')
  })

  it('leaves a trailing separator elsewhere, so it reads as unfinished', () => {
    expect(formatModifiers(['Control', 'Shift'], 'win32')).toBe('Ctrl+Shift+')
  })

  it('is empty when no modifiers are held', () => {
    expect(formatModifiers([], 'darwin')).toBe('')
    expect(formatModifiers([], 'win32')).toBe('')
  })
})

describe('acceleratorProblem', () => {
  it('accepts a chord with a real modifier', () => {
    expect(acceleratorProblem('Control+Alt+K')).toBeNull()
    expect(acceleratorProblem('Command+Shift+4')).toBeNull()
    expect(acceleratorProblem('CmdOrCtrl+num5')).toBeNull()
  })

  it('rejects a bare key, which would swallow normal typing', () => {
    expect(acceleratorProblem('K')).toBe('needs-modifier')
  })

  it('rejects Shift on its own, which is not enough to be global', () => {
    expect(acceleratorProblem('Shift+K')).toBe('needs-modifier')
  })

  it('rejects modifiers with no key to press', () => {
    expect(acceleratorProblem('Command+Shift')).toBe('needs-key')
    expect(acceleratorProblem('')).toBe('needs-key')
  })

  it('rejects a key Electron would not recognise', () => {
    expect(acceleratorProblem('Command+Lang1')).toBe('unsupported-key')
  })
})

describe('problemMessage', () => {
  it('names the modifiers of the platform it is asked about', () => {
    expect(problemMessage('needs-modifier', 'darwin')).toContain('Command')
    expect(problemMessage('needs-modifier', 'win32')).toContain('Ctrl')
  })

  it('has wording for every problem', () => {
    for (const problem of ['needs-key', 'needs-modifier', 'unsupported-key'] as const) {
      expect(problemMessage(problem, 'darwin').length).toBeGreaterThan(0)
    }
  })
})

describe('formatAccelerator', () => {
  it('draws macOS modifiers as symbols in the platform order', () => {
    expect(formatAccelerator('Control+Alt+Shift+Command+Q', 'darwin')).toBe('⌃⌥⇧⌘Q')
  })

  it('resolves the cross-platform modifier per platform', () => {
    expect(formatAccelerator(DEFAULT_CAPTURE_SHORTCUT, 'darwin')).toBe('⇧⌘2')
    expect(formatAccelerator(DEFAULT_CAPTURE_SHORTCUT, 'win32')).toBe('Ctrl+Shift+2')
  })

  it('spells modifiers out off macOS', () => {
    expect(formatAccelerator('Control+Alt+K', 'win32')).toBe('Ctrl+Alt+K')
    expect(formatAccelerator('Super+K', 'linux')).toBe('Super+K')
  })

  it('uses the familiar macOS glyphs for named keys', () => {
    expect(formatAccelerator('Command+Up', 'darwin')).toBe('⌘↑')
    expect(formatAccelerator('Command+Return', 'darwin')).toBe('⌘↩')
  })

  it('leaves named keys spelled out elsewhere', () => {
    expect(formatAccelerator('Control+Up', 'win32')).toBe('Ctrl+Up')
  })

  it('passes an unparseable accelerator through rather than showing nothing', () => {
    expect(formatAccelerator('', 'darwin')).toBe('')
  })
})
