import { describe, expect, it } from 'vitest'
import {
  canvasCursor,
  REGION_RETICLE_CURSOR,
  RETICLE_CURSOR,
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
  it('uses a 40px outlined amber reticle with four long arms', () => {
    expect(REGION_RETICLE_CURSOR).toContain("width='40' height='40'")
    expect(REGION_RETICLE_CURSOR).toContain(
      "d='M20 1V17M20 23V39M1 20H17M23 20H39'",
    )
    expect(REGION_RETICLE_CURSOR).toContain("stroke='%23000'")
    expect(REGION_RETICLE_CURSOR).toContain("stroke='%23f5a000'")
    expect(REGION_RETICLE_CURSOR).toContain(') 20 20, crosshair')
  })
})
