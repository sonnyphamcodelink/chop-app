import { describe, expect, it } from 'vitest'
import { APP_ICON_MARGIN_RATIO, logoSvg, markSvg, MARK, TILE } from '../../scripts/logo.mjs'

describe('markSvg', () => {
  it('draws the four bracket corners from the design', () => {
    const svg = markSvg()

    for (const path of MARK.paths) {
      expect(svg).toContain(`d="${path}"`)
    }
    expect(svg).toContain('stroke-width="9"')
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg).toContain('viewBox="0 0 120 120"')
  })

  it('recolours the mark for the monochrome tray template image', () => {
    expect(markSvg({ size: 16, color: '#000000' })).toContain('stroke="#000000"')
    expect(markSvg({ size: 16, color: '#000000' })).not.toContain(MARK.stroke)
  })
})

describe('logoSvg', () => {
  it('centres the white mark on the teal tile at full bleed', () => {
    const svg = logoSvg()

    expect(svg).toContain(`fill="${TILE.fill}"`)
    expect(svg).toContain(`rx="${TILE.radius}"`)
    expect(svg).toContain(`width="${TILE.size}" height="${TILE.size}"`)
    expect(svg).toContain('x="0" y="0"')
    // (220 - 120) / 2 on both axes, drawn at the mark's own scale.
    expect(svg).toContain('transform="translate(50 50) scale(1)"')
    expect(svg).toContain(`stroke="${MARK.stroke}"`)
  })

  it('scales the tile radius and mark with the app icon margin', () => {
    const svg = logoSvg({ size: 1024, marginRatio: APP_ICON_MARGIN_RATIO })
    const margin = TILE.size * APP_ICON_MARGIN_RATIO
    const scale = 1 - APP_ICON_MARGIN_RATIO * 2

    expect(svg).toContain(`width="1024" height="1024"`)
    // The canvas keeps the design's coordinate system; only the tile shrinks.
    expect(svg).toContain(`viewBox="0 0 ${TILE.size} ${TILE.size}"`)
    expect(svg).toContain(`x="${margin}" y="${margin}"`)
    expect(svg).toContain(`width="${TILE.size - margin * 2}"`)
    expect(svg).toContain(`rx="${TILE.radius * scale}"`)
    expect(svg).toContain(`scale(${scale})`)
  })
})
