import { beforeEach, describe, expect, it, vi } from 'vitest'

type Template = {
  label?: string
  type?: string
  checked?: boolean
  accelerator?: string
  click?: () => void
}[]

/** Menus handed to the tray, oldest first. */
const menus: Template[] = []

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/app',
    getVersion: () => '1.2.3',
  },
  nativeImage: { createFromPath: () => ({ setTemplateImage: () => {} }) },
  Menu: { buildFromTemplate: (template: Template) => template },
  Tray: class {
    setToolTip(): void {}
    setContextMenu(menu: Template): void {
      menus.push(menu)
    }
  },
  shell: { openPath: async () => {} },
}))

const { createTray } = await import('../../src/main/tray')

let shortcut = 'CommandOrControl+Shift+2'
let settingsOpened = 0

function build(): { refresh(): void } {
  return createTray({
    onCapture: () => {},
    onOpenEditor: () => {},
    onOpenSettings: () => void (settingsOpened += 1),
    onCheckForUpdates: () => {},
    captureShortcut: () => shortcut,
    captureRoot: () => '/captures',
  })
}

beforeEach(() => {
  menus.length = 0
  shortcut = 'CommandOrControl+Shift+2'
  settingsOpened = 0
})

describe('createTray', () => {
  it('does not offer Open at Login', () => {
    build()
    const labels = (menus[0] ?? []).map((entry) => entry.label)
    expect(labels).not.toContain('Open at Login')
  })

  it('keeps the action entries', () => {
    build()
    const labels = (menus[0] ?? []).map((entry) => entry.label)
    expect(labels).toEqual([
      'Capture',
      'Open Editor',
      undefined, // separator
      'Open Captures Folder',
      'Settings…',
      undefined, // separator
      'Version 1.2.3',
      'Check for Updates…',
      undefined, // separator
      'Quit Chop',
    ])
  })

  it('shows the capture shortcut in force', () => {
    shortcut = 'Control+Alt+K'
    build()
    const capture = (menus[0] ?? []).find((entry) => entry.label === 'Capture')
    expect(capture?.accelerator).toBe('Control+Alt+K')
  })

  it('picks up a shortcut changed elsewhere when refreshed', () => {
    const controller = build()
    shortcut = 'Control+Alt+K'
    controller.refresh()

    const capture = (menus[1] ?? []).find((entry) => entry.label === 'Capture')
    expect(capture?.accelerator).toBe('Control+Alt+K')
  })

  it('opens settings from the menu', () => {
    build()
    ;(menus[0] ?? []).find((entry) => entry.label === 'Settings…')?.click?.()
    expect(settingsOpened).toBe(1)
  })
})
