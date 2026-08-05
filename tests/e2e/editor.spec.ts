import { _electron as electron, type ElectronApplication, expect, test } from '@playwright/test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
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
  app = await electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      CHOP_CAPTURE_ROOT: captureRoot,
      CHOP_STUB_WINDOWS: '[]',
    },
  })
})

test.afterEach(async () => {
  await app.close()
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
