import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setAboutPanelOptions = vi.fn()
const showAboutPanel = vi.fn()

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/app',
    getVersion: () => '1.2.3',
    setAboutPanelOptions,
    showAboutPanel,
  },
}))

const { showAboutChop } = await import('../../src/main/about')

beforeEach(() => {
  setAboutPanelOptions.mockClear()
  showAboutPanel.mockClear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-18T00:00:00.000Z'))
})

afterEach(() => vi.useRealTimers())

describe('showAboutChop', () => {
  it('configures the native panel with app metadata and shows it', () => {
    showAboutChop()

    expect(setAboutPanelOptions).toHaveBeenCalledWith({
      applicationName: 'Chop',
      applicationVersion: '1.2.3',
      credits: 'Personal screen capture and annotation tool',
      copyright: '© 2026 Chop',
      iconPath: '/app/build/icon.png',
    })
    expect(showAboutPanel).toHaveBeenCalledOnce()
  })
})
