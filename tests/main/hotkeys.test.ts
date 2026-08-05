import { describe, expect, it } from 'vitest'
import { captureAccelerator } from '../../src/main/hotkey-accelerator'

describe('captureAccelerator', () => {
  it('uses a cross-platform modifier', () => {
    expect(captureAccelerator()).toBe('CommandOrControl+Shift+2')
  })
})
