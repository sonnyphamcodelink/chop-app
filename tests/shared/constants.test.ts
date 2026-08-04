import { describe, expect, it } from 'vitest'
import * as constants from '@shared/constants'

describe('constants', () => {
  it('defines every tunable threshold as a positive number', () => {
    const required = [
      'HISTORY_LIMIT',
      'AUTOSAVE_DEBOUNCE_MS',
      'THUMBNAIL_SIZE',
      'PIXELATE_BLOCK_SIZE',
      'WINDOW_PROVIDER_TIMEOUT_MS',
      'MIN_WINDOW_DIMENSION',
      'MIN_SELECTION_DIMENSION',
      'DEFAULT_STROKE_WIDTH',
      'DEFAULT_FONT_SIZE',
      'HANDLE_SIZE',
    ] as const

    for (const key of required) {
      const value = (constants as Record<string, unknown>)[key]
      expect(typeof value, `${key} must be defined`).toBe('number')
      expect(value as number, `${key} must be positive`).toBeGreaterThan(0)
    }
  })
})
