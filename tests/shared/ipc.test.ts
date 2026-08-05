import { describe, expect, it } from 'vitest'
import { CHANNELS } from '@shared/ipc'

describe('CHANNELS', () => {
  it('namespaces every channel under chop:', () => {
    for (const channel of Object.values(CHANNELS)) {
      expect(channel).toMatch(/^chop:/)
    }
  })

  it('defines unique channel names', () => {
    const values = Object.values(CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })
})
