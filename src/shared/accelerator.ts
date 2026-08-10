/**
 * Electron accelerators, from the keyboard event that produced them through to
 * the glyphs shown in menus. Dependency-free so the main process, the preload
 * bridge and the settings page can all agree on one spelling of a shortcut.
 */

/** The capture shortcut Chop ships with: ⇧⌘2 on macOS, Ctrl+Shift+2 elsewhere. */
export const DEFAULT_CAPTURE_SHORTCUT = 'CommandOrControl+Shift+2'

/** Structural match for KeyboardEvent, kept free of DOM types for the main process. */
export type KeyChordEvent = {
  /** Physical key, so the shortcut survives a layout change. */
  readonly code: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

export type AcceleratorProblem = 'needs-key' | 'needs-modifier' | 'unsupported-key'

/**
 * Keys named differently by the DOM and by Electron. Escape is deliberately
 * absent: the recorder needs it to mean "stop recording".
 */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  Enter: 'Return',
  NumpadEnter: 'Return',
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
  NumpadDecimal: 'numdec',
}

const LETTER = /^Key([A-Z])$/
const DIGIT = /^Digit([0-9])$/
const NUMPAD_DIGIT = /^Numpad([0-9])$/
const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/

/** The Electron key name for a physical key, or null when it cannot be one. */
function keyFromCode(code: string): string | null {
  const letter = LETTER.exec(code)
  if (letter?.[1]) return letter[1]

  const digit = DIGIT.exec(code)
  if (digit?.[1]) return digit[1]

  const numpad = NUMPAD_DIGIT.exec(code)
  if (numpad?.[1]) return `num${numpad[1]}`

  if (FUNCTION_KEY.test(code)) return code

  return NAMED_KEYS[code] ?? null
}

const NUMPAD_KEY = /^num[0-9]$/

function isSupportedKey(key: string): boolean {
  if (/^[A-Z0-9]$/.test(key)) return true
  if (FUNCTION_KEY.test(key)) return true
  if (NUMPAD_KEY.test(key)) return true
  return Object.values(NAMED_KEYS).includes(key)
}

/** Modifier aliases Electron accepts, normalised to one spelling each. */
const MODIFIER_ALIASES: Readonly<Record<string, string>> = {
  command: 'Command',
  cmd: 'Command',
  control: 'Control',
  ctrl: 'Control',
  commandorcontrol: 'CommandOrControl',
  cmdorctrl: 'CommandOrControl',
  alt: 'Alt',
  option: 'Alt',
  altgr: 'AltGr',
  shift: 'Shift',
  super: 'Super',
  meta: 'Super',
}

/** Modifiers that make a chord global; Shift alone would eat ordinary typing. */
const QUALIFYING_MODIFIERS = ['Command', 'Control', 'CommandOrControl', 'Alt', 'AltGr', 'Super']

export type ParsedAccelerator = {
  readonly modifiers: readonly string[]
  readonly key: string
}

/** Splits an accelerator into normalised modifiers and its single key. */
export function parseAccelerator(accelerator: string): ParsedAccelerator {
  const modifiers: string[] = []
  let key = ''

  for (const part of accelerator.split('+')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const modifier = MODIFIER_ALIASES[trimmed.toLowerCase()]
    if (modifier) {
      if (!modifiers.includes(modifier)) modifiers.push(modifier)
      continue
    }
    // Anything that is not a modifier is the key; a later one wins so a
    // malformed accelerator still yields something to report on.
    key = trimmed.length === 1 ? trimmed.toUpperCase() : trimmed
  }

  return { modifiers, key }
}

/** Why the accelerator cannot be used as a global shortcut, or null when it can. */
export function acceleratorProblem(accelerator: string): AcceleratorProblem | null {
  const { modifiers, key } = parseAccelerator(accelerator)
  if (!key) return 'needs-key'
  if (!isSupportedKey(key)) return 'unsupported-key'
  if (!modifiers.some((modifier) => QUALIFYING_MODIFIERS.includes(modifier))) {
    return 'needs-modifier'
  }
  return null
}

export function problemMessage(problem: AcceleratorProblem, platform: string): string {
  if (problem === 'needs-key') return 'Hold the modifiers and press one more key.'
  if (problem === 'unsupported-key') return 'That key cannot be part of a shortcut.'
  return platform === 'darwin'
    ? 'Include Command, Control or Option in the shortcut.'
    : 'Include Ctrl or Alt in the shortcut.'
}

/** The modifiers held during a key press, in the app's canonical order. */
export function modifiersFromEvent(
  event: KeyChordEvent,
  platform: string,
): readonly string[] {
  const modifiers: string[] = []
  if (event.ctrlKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  // The Command key is Super everywhere it is not a Mac.
  if (event.metaKey) modifiers.push(platform === 'darwin' ? 'Command' : 'Super')
  return modifiers
}

/**
 * The accelerator for a key press, or null when the press is not one on its own
 * — a bare modifier, Escape, or a key Electron cannot name.
 */
export function acceleratorFromEvent(
  event: KeyChordEvent,
  platform: string,
): string | null {
  const key = keyFromCode(event.code)
  if (!key) return null
  return [...modifiersFromEvent(event, platform), key].join('+')
}

/** macOS draws modifiers as glyphs, in a fixed order of its own. */
const MAC_MODIFIER_GLYPHS: readonly (readonly [string, string])[] = [
  ['Control', '⌃'],
  ['Alt', '⌥'],
  ['AltGr', '⌥'],
  ['Shift', '⇧'],
  ['Command', '⌘'],
  ['CommandOrControl', '⌘'],
  ['Super', '⌘'],
]

const OTHER_MODIFIER_NAMES: Readonly<Record<string, string>> = {
  Control: 'Ctrl',
  CommandOrControl: 'Ctrl',
  Command: 'Win',
  Super: 'Super',
  Alt: 'Alt',
  AltGr: 'AltGr',
  Shift: 'Shift',
}

const MAC_KEY_GLYPHS: Readonly<Record<string, string>> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Return: '↩',
  Backspace: '⌫',
  Delete: '⌦',
  Tab: '⇥',
}

/** Modifiers alone as the user should read them, e.g. `⇧⌘` or `Ctrl+Shift+`. */
export function formatModifiers(modifiers: readonly string[], platform: string): string {
  if (platform === 'darwin') {
    return MAC_MODIFIER_GLYPHS.filter(([name]) => modifiers.includes(name))
      .map(([, glyph]) => glyph)
      .join('')
  }
  const names = modifiers.map((modifier) => OTHER_MODIFIER_NAMES[modifier] ?? modifier)
  return names.length > 0 ? `${names.join('+')}+` : ''
}

/** The accelerator as the user should read it, e.g. `⇧⌘2` or `Ctrl+Shift+2`. */
export function formatAccelerator(accelerator: string, platform: string): string {
  const { modifiers, key } = parseAccelerator(accelerator)
  if (!key) return accelerator

  const prefix = formatModifiers(modifiers, platform)
  return platform === 'darwin' ? `${prefix}${MAC_KEY_GLYPHS[key] ?? key}` : `${prefix}${key}`
}
