import { describe, expect, it } from 'vitest'
import {
  canvasCursor,
  REGION_ARM_GAP,
  REGION_ARM_LENGTH,
  REGION_ARM_WEIGHT,
  REGION_GUIDE_THICKNESS,
  REGION_RETICLE_CURSOR,
  RETICLE_CURSOR,
  WINDOW_FRAME_DASH,
  WINDOW_FRAME_GAP,
} from '@shared/cursor'

describe('canvasCursor', () => {
  it('uses the reticle when nothing is under the pointer', () => {
    expect(canvasCursor({ kind: 'none' })).toBe(RETICLE_CURSOR)
  })

  it('renders four black arms and a black centre dot without an accent colour', () => {
    expect(RETICLE_CURSOR).toContain(
      "d='M16 1V13M16 19V31M1 16H13M19 16H31'",
    )
    expect(RETICLE_CURSOR).toContain(
      "%3Ccircle cx='16' cy='16' r='2' fill='%23000'/%3E",
    )
    expect(RETICLE_CURSOR).not.toContain('%23ffd400')
  })

  it('keeps move and resize cursors when editing a placed shape', () => {
    expect(canvasCursor({ kind: 'move' })).toBe('move')
    expect(canvasCursor({ kind: 'resize', cursor: 'nwse-resize' })).toBe('nwse-resize')
  })
})

describe('REGION_RETICLE_CURSOR', () => {
  it('draws only the dark hairline cross, crossing at the hotspot', () => {
    expect(REGION_RETICLE_CURSOR).toContain("width='40' height='40'")
    expect(REGION_RETICLE_CURSOR).toContain("d='M20 0V40M0 20H40'")
    expect(REGION_RETICLE_CURSOR).toContain("stroke='%23000' stroke-opacity='.55'")
    expect(REGION_RETICLE_CURSOR).toContain(') 20 20, crosshair')
  })

  it('leaves the accent arms to the overlay, which has no 128px cursor cap', () => {
    expect(REGION_RETICLE_CURSOR).not.toContain('%23f5a000')
    expect(REGION_ARM_GAP + REGION_ARM_LENGTH).toBeGreaterThan(64)
  })
})

describe('region guides and arms', () => {
  it('keeps the guides at a hairline and the arms heavier than them', () => {
    expect(REGION_GUIDE_THICKNESS).toBe(1)
    expect(REGION_ARM_WEIGHT).toBeGreaterThan(REGION_GUIDE_THICKNESS)
  })

  it('holds the arms off the centre and runs them 15% longer than before', () => {
    expect(REGION_ARM_GAP).toBe(20)
    expect(REGION_ARM_LENGTH).toBe(Math.round(44 * 1.15))
  })
})

describe('candidate window frame', () => {
  it('dashes longer than it gaps, so the edge still reads as a line', () => {
    expect(WINDOW_FRAME_DASH).toBeGreaterThan(WINDOW_FRAME_GAP)
  })
})
