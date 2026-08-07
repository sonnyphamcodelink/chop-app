/**
 * The Chop mark, kept in one place so every rendering of it — app icon, tray
 * icon, brand SVG — comes from the same geometry.
 *
 * Source of truth: the "Chop Logo" design (claude.ai/design project
 * "Annotation Toolbar Redesign"). The card's drop shadow is presentation, not
 * part of the mark, so it is deliberately not reproduced here.
 */

/** Rounded tile the mark sits on. */
export const TILE = {
  size: 220,
  radius: 56,
  fill: '#004a62',
}

/** Four bracket corners, drawn on a 120×120 grid centred in the tile. */
export const MARK = {
  size: 120,
  stroke: '#ffffff',
  strokeWidth: 9,
  paths: [
    'M8 40V16C8 11.5817 11.5817 8 16 8H40',
    'M112 40V16C112 11.5817 108.418 8 104 8H80',
    'M8 80V104C8 108.418 11.5817 112 16 112H40',
    'M112 80V104C112 108.418 108.418 112 104 112H80',
  ],
}

/**
 * Transparent margin on each side of the app icon, as a fraction of the
 * canvas. macOS expects the rounded tile to sit inside the icon bounds rather
 * than bleed to the edge, so it lines up with the rest of the Dock.
 */
export const APP_ICON_MARGIN_RATIO = 0.1

function markPaths(color, strokeWidth = MARK.strokeWidth) {
  return MARK.paths
    .map(
      (d) =>
        `<path d="${d}" stroke="${color}" stroke-width="${strokeWidth}" ` +
        'stroke-linecap="round" stroke-linejoin="round"/>',
    )
    .join('')
}

function svg(size, viewBox, body) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="${viewBox}" fill="none">${body}</svg>`
  )
}

/** The bare bracket mark — used for the monochrome macOS tray template image. */
export function markSvg({ size = MARK.size, color = MARK.stroke } = {}) {
  return svg(size, `0 0 ${MARK.size} ${MARK.size}`, markPaths(color))
}

/**
 * The full logo: bracket mark on the rounded tile. `marginRatio` insets the
 * tile within the canvas, leaving the surrounding pixels transparent.
 */
export function logoSvg({ size = TILE.size, marginRatio = 0 } = {}) {
  const canvas = TILE.size
  const margin = canvas * marginRatio
  const tile = canvas - margin * 2
  const scale = tile / TILE.size
  const mark = MARK.size * scale
  const offset = margin + (tile - mark) / 2

  const body =
    `<rect x="${margin}" y="${margin}" width="${tile}" height="${tile}" ` +
    `rx="${TILE.radius * scale}" fill="${TILE.fill}"/>` +
    `<g transform="translate(${offset} ${offset}) scale(${scale})">` +
    `${markPaths(MARK.stroke)}</g>`

  return svg(size, `0 0 ${canvas} ${canvas}`, body)
}
