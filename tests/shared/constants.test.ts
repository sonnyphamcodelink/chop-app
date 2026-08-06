import { describe, expect, it } from 'vitest'
import * as constants from '@shared/constants'
import {
  DEFAULT_STROKE_WIDTH,
  HANDLE_HIT_SIZE,
  HANDLE_SIZE,
  STROKE_WIDTH_MAX,
  STROKE_WIDTH_MIN,
  STROKE_WIDTHS,
} from '@shared/constants'

describe('constants', () => {
  it('defines every tunable threshold as a positive number', () => {
    const required = [
      'HISTORY_LIMIT',
      'AUTOSAVE_DEBOUNCE_MS',
      'THUMBNAIL_SIZE',
      'BLUR_SAMPLE_SIZE',
      'WINDOW_PROVIDER_TIMEOUT_MS',
      'MIN_WINDOW_DIMENSION',
      'MIN_SELECTION_DIMENSION',
      'STROKE_WIDTH_MIN',
      'STROKE_WIDTH_MAX',
      'DEFAULT_STROKE_WIDTH',
      'DEFAULT_FONT_SIZE',
      'HANDLE_SIZE',
      'HANDLE_HIT_SIZE',
    ] as const

    for (const key of required) {
      const value = (constants as Record<string, unknown>)[key]
      expect(typeof value, `${key} must be defined`).toBe('number')
      expect(value as number, `${key} must be positive`).toBeGreaterThan(0)
    }
  })

  it('orders the offered stroke weights inside the allowed range', () => {
    const widths = [STROKE_WIDTHS.thin, STROKE_WIDTHS.medium, STROKE_WIDTHS.thick]
    for (const width of widths) {
      expect(width).toBeGreaterThanOrEqual(STROKE_WIDTH_MIN)
      expect(width).toBeLessThanOrEqual(STROKE_WIDTH_MAX)
    }
    expect([...widths].sort((a, b) => a - b)).toEqual(widths)
  })

  it('defaults the stroke width to the bold end of the offered weights', () => {
    expect(DEFAULT_STROKE_WIDTH).toBe(STROKE_WIDTHS.thick)
    expect(DEFAULT_STROKE_WIDTH / STROKE_WIDTH_MAX).toBeGreaterThanOrEqual(0.75)
  })

  it('gives a resize handle a grab area larger than it is drawn', () => {
    expect(HANDLE_HIT_SIZE).toBeGreaterThan(HANDLE_SIZE)
  })
})
