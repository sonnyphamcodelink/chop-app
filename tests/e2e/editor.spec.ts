import { _electron as electron, type ElectronApplication, expect, test } from '@playwright/test'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let captureRoot: string

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

type Capture = {
  id: string
  dataUrl: string
  width: number
  height: number
  createdAt: string
}

/** Drives the editor the way main does, bypassing real screen capture. */
async function sendCapture(capture: Capture): Promise<void> {
  await app.evaluate((_electron, payload) => {
    const send = (globalThis as { __chopSendCapture?: (c: Capture) => void })
      .__chopSendCapture
    if (!send) throw new Error('__chopSendCapture seam is missing')
    send(payload)
  }, capture)
}

test.beforeEach(async () => {
  captureRoot = await mkdtemp(join(tmpdir(), 'chop-e2e-'))
  // Cursor/agent shells may set ELECTRON_RUN_AS_NODE=1, which makes Electron
  // reject Playwright's --remote-debugging-port and fail to launch.
  const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env
  app = await electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...env,
      CHOP_CAPTURE_ROOT: captureRoot,
      CHOP_STUB_WINDOWS: '[]',
    },
  })
})

test.afterEach(async () => {
  await app?.close()
  await rm(captureRoot, { recursive: true, force: true })
})

test('an incoming capture opens the editor and is auto-saved', async () => {
  await sendCapture({
    id: 'e2e-1',
    dataUrl: ONE_PIXEL_PNG,
    width: 1,
    height: 1,
    createdAt: new Date().toISOString(),
  })

  const page = await app.firstWindow()
  await expect(page.locator('#canvas')).toBeVisible()
  await expect(page.locator('#empty')).toBeHidden()

  await expect
    .poll(async () => (await readdir(captureRoot)).filter((f) => f.endsWith('.png')).length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0)
})

test('drawing a box is undoable and lands in the saved document', async () => {
  await sendCapture({
    id: 'e2e-2',
    dataUrl: ONE_PIXEL_PNG,
    width: 400,
    height: 300,
    createdAt: new Date().toISOString(),
  })

  const page = await app.firstWindow()
  await expect(page.locator('#empty')).toBeHidden()
  await page.getByRole('button', { name: 'Box' }).click()

  const canvas = page.locator('#canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no bounding box')

  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 90)
  await page.mouse.up()

  await expect
    .poll(async () => (await readdir(join(captureRoot, '.chop', 'docs'))).length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0)

  await page.keyboard.press('Meta+z')
  // The tool stays selected after an undo; only the document changes.
  await expect(page.getByRole('button', { name: 'Box' })).toHaveClass(/active/)
})

/** The crop rect of the most recently written document sidecar, if any. */
async function savedCropRect(): Promise<unknown> {
  const dir = join(captureRoot, '.chop', 'docs')
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) =>
    f.endsWith('.json'),
  )
  const name = files.sort().at(-1)
  if (!name) return undefined
  return JSON.parse(await readFile(join(dir, name), 'utf8')).cropRect
}

test('Enter saves a crop and Escape abandons it', async () => {
  await sendCapture({
    id: 'e2e-4',
    dataUrl: ONE_PIXEL_PNG,
    width: 400,
    height: 300,
    createdAt: new Date().toISOString(),
  })

  const page = await app.firstWindow()
  await expect(page.locator('#empty')).toBeHidden()

  const canvas = page.locator('#canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no bounding box')

  /** Drags the south-east crop handle 100px in from the bottom-right corner. */
  async function dragCornerInward(): Promise<void> {
    await page.getByRole('button', { name: 'Crop' }).click()
    await page.mouse.move(box!.x + box!.width - 2, box!.y + box!.height - 2)
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width - 100, box!.y + box!.height - 100)
    await page.mouse.up()
  }

  await dragCornerInward()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Crop' })).not.toHaveClass(/active/)
  // Outlast the autosave debounce: an abandoned crop must never reach disk.
  await page.waitForTimeout(2000)
  expect(await savedCropRect()).toBeNull()

  await dragCornerInward()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Crop' })).not.toHaveClass(/active/)
  await expect
    .poll(async () => (await savedCropRect()) as { width?: number } | null, {
      timeout: 10_000,
    })
    .toMatchObject({ width: expect.any(Number) })
})

test('the tray keeps the app alive after the editor closes', async () => {
  await sendCapture({
    id: 'e2e-3',
    dataUrl: ONE_PIXEL_PNG,
    width: 1,
    height: 1,
    createdAt: new Date().toISOString(),
  })
  await app.firstWindow()

  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.destroy()
  })

  // Reaching the main process at all proves it did not quit with its last window.
  const remaining = await app.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
  )
  expect(remaining).toBe(0)
})
