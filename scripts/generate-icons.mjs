/**
 * Rasterises the Chop mark into the icons the app and installer need.
 *
 * Runs under Electron (`npm run build:icons`) because Electron is the only
 * renderer this project already depends on — no ImageMagick or headless
 * Chromium download required.
 */
import { app, BrowserWindow } from 'electron'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { APP_ICON_MARGIN_RATIO, logoSvg, markSvg } from './logo.mjs'

const TRAY_COLOR = '#000000'

/**
 * Everything renders at this size and is scaled down to the target. A window
 * only a few pixels wide fails to load on macOS, and downsampling from a large
 * frame keeps the round caps smooth at tray sizes.
 */
const RENDER_SIZE = 1024

/** Brand asset, checked in so the mark is editable without running Electron. */
const SVG_TARGETS = [{ file: 'resources/logo.svg', svg: logoSvg({}) }]

const PNG_TARGETS = [
  {
    file: 'build/icon.png',
    size: 1024,
    svg: logoSvg({ size: RENDER_SIZE, marginRatio: APP_ICON_MARGIN_RATIO }),
  },
  // Tray icons are template images: black on transparent, tinted by macOS.
  { file: 'resources/tray-icon.png', size: 16, svg: markSvg({ size: RENDER_SIZE, color: TRAY_COLOR }) },
  {
    file: 'resources/tray-icon@2x.png',
    size: 32,
    svg: markSvg({ size: RENDER_SIZE, color: TRAY_COLOR }),
  },
]

function write(file, data) {
  const path = resolve(file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, data)
  console.info(`Wrote ${file}`)
}

function createRenderWindow() {
  return new BrowserWindow({
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: true },
  })
}

/**
 * Renders through a file rather than a data URL: Chromium refuses repeated
 * data-URL navigations in the same offscreen window.
 */
async function rasterize(window, stagePath, svg, size) {
  const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}</style>${svg}`
  writeFileSync(stagePath, html)
  await window.loadFile(stagePath)

  const image = await window.webContents.capturePage()
  if (image.isEmpty()) {
    throw new Error(`Captured an empty frame for a ${size}px icon`)
  }
  return image.getSize().width === size
    ? image.toPNG()
    : image.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

async function main() {
  await app.whenReady()

  for (const target of SVG_TARGETS) {
    write(target.file, `${target.svg}\n`)
  }

  const stagePath = join(app.getPath('temp'), 'chop-icon-stage.html')
  const window = createRenderWindow()
  try {
    for (const target of PNG_TARGETS) {
      write(target.file, await rasterize(window, stagePath, target.svg, target.size))
    }
  } finally {
    window.destroy()
    rmSync(stagePath, { force: true })
  }
}

main()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error('Failed to generate icons.')
    console.error(error)
    app.exit(1)
  })
