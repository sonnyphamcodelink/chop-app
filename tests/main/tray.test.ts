import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LoginItemState } from '../../src/main/login-item-state'

type Template = {
  label?: string
  type?: string
  checked?: boolean
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

const toggles: boolean[] = []
let state: LoginItemState = 'disabled'

function build(): void {
  createTray({
    onCapture: () => {},
    onOpenEditor: () => {},
    onCheckForUpdates: () => {},
    openAtLogin: () => state,
    onToggleOpenAtLogin: (enabled) => void toggles.push(enabled),
    captureRoot: () => '/captures',
  })
}

const loginItem = (menu: Template): Template[number] | undefined =>
  menu.find((entry) => entry.label === 'Open at Login')

beforeEach(() => {
  menus.length = 0
  toggles.length = 0
  state = 'disabled'
})

describe('createTray', () => {
  it('offers Open at Login as an unchecked checkbox when it is off', () => {
    build()
    const item = loginItem(menus[0] ?? [])
    expect(item?.type).toBe('checkbox')
    expect(item?.checked).toBe(false)
  })

  it('checks the item when the OS launches Chop at login', () => {
    state = 'enabled'
    build()
    expect(loginItem(menus[0] ?? [])?.checked).toBe(true)
  })

  it('leaves the item unchecked while approval is pending', () => {
    state = 'requires-approval'
    build()
    expect(loginItem(menus[0] ?? [])?.checked).toBe(false)
  })

  it('omits the item where login items are unsupported', () => {
    state = 'unsupported'
    build()
    expect(loginItem(menus[0] ?? [])).toBeUndefined()
  })

  it('asks to turn the login item on when it is off', () => {
    build()
    loginItem(menus[0] ?? [])?.click?.()
    expect(toggles).toEqual([true])
  })

  it('asks to turn the login item off when it is on', () => {
    state = 'enabled'
    build()
    loginItem(menus[0] ?? [])?.click?.()
    expect(toggles).toEqual([false])
  })

  it('redraws the menu from the state the OS reports after a toggle', () => {
    build()
    state = 'enabled'
    loginItem(menus[0] ?? [])?.click?.()

    expect(menus).toHaveLength(2)
    expect(loginItem(menus[1] ?? [])?.checked).toBe(true)
  })

  it('keeps the item unchecked when the OS refused the change', () => {
    build()
    loginItem(menus[0] ?? [])?.click?.()
    expect(loginItem(menus[1] ?? [])?.checked).toBe(false)
  })

  it('keeps the existing entries alongside the new one', () => {
    build()
    const labels = (menus[0] ?? []).map((entry) => entry.label)
    expect(labels).toContain('Capture')
    expect(labels).toContain('Open Editor')
    expect(labels).toContain('Open Captures Folder')
    expect(labels).toContain('Check for Updates…')
    expect(labels).toContain('Quit Chop')
  })
})
