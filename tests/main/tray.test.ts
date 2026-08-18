import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LicenseStatus } from '../../src/shared/license/status'
import { SAMPLE_CLAIMS } from '../helpers/license-keys'

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
let aboutOpened = 0
let settingsOpened = 0
let licenseOpened = 0
let feedbackOpened = 0
let status: LicenseStatus = { kind: 'licensed', claims: SAMPLE_CLAIMS }

function build(): { refresh(): void } {
  return createTray({
    onAbout: () => void (aboutOpened += 1),
    onCapture: () => {},
    onOpenEditor: () => {},
    onOpenSettings: () => void (settingsOpened += 1),
    onOpenLicense: () => void (licenseOpened += 1),
    onSendFeedback: () => void (feedbackOpened += 1),
    onCheckForUpdates: () => {},
    captureShortcut: () => shortcut,
    captureRoot: () => '/captures',
    licenseStatus: () => status,
  })
}

beforeEach(() => {
  menus.length = 0
  shortcut = 'CommandOrControl+Shift+2'
  aboutOpened = 0
  settingsOpened = 0
  licenseOpened = 0
  feedbackOpened = 0
  status = { kind: 'licensed', claims: SAMPLE_CLAIMS }
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
      'About Chop',
      undefined, // separator
      'Capture',
      'Open Editor',
      undefined, // separator
      'Open Captures Folder',
      'Settings…',
      'Send Feedback…',
      undefined, // separator
      'Licensed',
      undefined, // separator
      'Version 1.2.3',
      'Check for Updates…',
      undefined, // separator
      'Quit Chop',
    ])
  })

  it('shows the licence state and offers no key entry once licensed', () => {
    build()
    const labels = (menus[0] ?? []).map((entry) => entry.label)
    expect(labels).toContain('Licensed')
    expect(labels).not.toContain('Enter Licence…')
  })

  it('offers key entry whenever a licence is wanted', () => {
    status = { kind: 'trial', daysLeft: 6, endsAt: '2026-08-20T00:00:00.000Z' }
    build()

    const labels = (menus[0] ?? []).map((entry) => entry.label)
    expect(labels).toContain('Trial — 6 days left')
    ;(menus[0] ?? []).find((entry) => entry.label === 'Enter Licence…')?.click?.()
    expect(licenseOpened).toBe(1)
  })

  it('picks up a licence that changed elsewhere when refreshed', () => {
    status = { kind: 'trial-expired', endsAt: '2026-08-01T00:00:00.000Z' }
    const controller = build()
    status = { kind: 'licensed', claims: SAMPLE_CLAIMS }
    controller.refresh()

    const labels = (menus[1] ?? []).map((entry) => entry.label)
    expect(labels).toContain('Licensed')
    expect(labels).not.toContain('Enter Licence…')
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

  it('opens About Chop from the first menu item', () => {
    build()
    const menu = menus[0] ?? []
    expect(menu[0]?.label).toBe('About Chop')
    menu[0]?.click?.()
    expect(aboutOpened).toBe(1)
  })

  it('offers feedback whatever the licence state', () => {
    status = { kind: 'trial-expired', endsAt: '2026-08-01T00:00:00.000Z' }
    build()
    ;(menus[0] ?? []).find((entry) => entry.label === 'Send Feedback…')?.click?.()
    expect(feedbackOpened).toBe(1)
  })
})
