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

  // The history bar must include the capture that is currently open.
  await expect(page.locator('#filmstrip .thumb.active')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('#filmstrip .thumb.active img')).toHaveAttribute('src', /data:image/)
})

test('zoom controls and Command+wheel resize the fitted canvas', async () => {
  await sendCapture({
    id: 'e2e-zoom',
    dataUrl: ONE_PIXEL_PNG,
    width: 400,
    height: 300,
    createdAt: new Date().toISOString(),
  })

  const page = await app.firstWindow()
  const canvas = page.locator('#canvas')
  const zoomLevel = page.locator('#zoom-level')
  await expect(canvas).toBeVisible()
  await expect(zoomLevel).toHaveText('100%')

  const initial = await canvas.boundingBox()
  if (!initial) throw new Error('canvas has no bounding box')

  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(zoomLevel).toHaveText('110%')
  await expect
    .poll(async () => (await canvas.boundingBox())?.width)
    .toBeCloseTo(initial.width * 1.1, 0)

  const zoomed = await canvas.boundingBox()
  if (!zoomed) throw new Error('zoomed canvas has no bounding box')
  await page.mouse.move(zoomed.x + zoomed.width / 2, zoomed.y + zoomed.height / 2)
  await page.keyboard.down('Meta')
  await page.mouse.wheel(0, 100)
  await page.keyboard.up('Meta')
  await expect(zoomLevel).toHaveText('100%')

  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Reset zoom' }).click()
  await expect(zoomLevel).toHaveText('100%')
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

test('a placed box can be moved and resized in any tool mode', async () => {
  await sendCapture({
    id: 'e2e-box-edit',
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

  // Draw a box from (20,20) to (120,90) in canvas space.
  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 90)
  await page.mouse.up()

  await expect
    .poll(async () => (await savedBox())?.rect.width, { timeout: 10_000 })
    .toBeGreaterThan(0)
  const drawn = await savedBox()

  // Switch away from Box — editing must still work, like callouts.
  await page.getByRole('button', { name: 'Arrow' }).click()

  // Drag the body to the right.
  await page.mouse.move(box.x + 70, box.y + 55)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 55, { steps: 8 })
  await page.mouse.up()

  await expect
    .poll(async () => (await savedBox())?.rect.x, { timeout: 10_000 })
    .toBeCloseTo(drawn.rect.x + 50, 0)

  const moved = await savedBox()

  // Drag the south-east corner outward.
  const seX = box.x + moved.rect.x + moved.rect.width
  const seY = box.y + moved.rect.y + moved.rect.height
  await page.mouse.move(seX, seY)
  await page.mouse.down()
  await page.mouse.move(seX + 40, seY + 30, { steps: 8 })
  await page.mouse.up()

  await expect
    .poll(async () => (await savedBox())?.rect.width, { timeout: 10_000 })
    .toBeGreaterThan(moved.rect.width)
})

test('a selected box is deleted by the Delete key', async () => {
  await sendCapture({
    id: 'e2e-box-delete',
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

  // Draw a box from (20,20) to (120,90) in canvas space.
  await page.mouse.move(box.x + 20, box.y + 20)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 90)
  await page.mouse.up()

  await expect
    .poll(async () => (await savedBox())?.rect.width, { timeout: 10_000 })
    .toBeGreaterThan(0)

  // Delete with nothing selected must leave the box alone.
  await page.keyboard.press('Delete')
  await expect
    .poll(async () => (await savedBox())?.rect.width, { timeout: 10_000 })
    .toBeGreaterThan(0)

  // Click the box body to select it, then Delete removes it.
  await page.mouse.click(box.x + 70, box.y + 55)
  await page.keyboard.press('Delete')
  await expect
    .poll(async () => savedAnnotations(), { timeout: 10_000 })
    .toEqual([])

  // Undo brings the box back.
  await page.keyboard.press('Meta+z')
  await expect
    .poll(async () => (await savedBox())?.rect.width, { timeout: 10_000 })
    .toBeGreaterThan(0)
})

/** The single box in the most recently written document sidecar. */
async function savedBox(): Promise<{
  rect: { x: number; y: number; width: number; height: number }
}> {
  const annotations = (await savedAnnotations()) as
    | readonly { kind: string }[]
    | undefined
  const found = annotations?.find((a) => a.kind === 'box')
  return found as never
}

test('a callout can be dragged around the capture and deleted from its badge', async () => {
  await sendCapture({
    id: 'e2e-callout-move',
    dataUrl: ONE_PIXEL_PNG,
    width: 400,
    height: 300,
    createdAt: new Date().toISOString(),
  })

  const page = await app.firstWindow()
  await expect(page.locator('#empty')).toBeHidden()
  await page.getByRole('button', { name: 'Callout' }).click()

  const box = await page.locator('#canvas').boundingBox()
  if (!box) throw new Error('canvas has no bounding box')

  // Press on what the note is about, release where the note should sit: the
  // press fixes the arrow tip, the release hangs the bubble above it.
  await page.mouse.move(box.x + 200, box.y + 250)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 150, { steps: 10 })
  await page.mouse.up()

  await expect
    .poll(async () => (await savedCallout())?.rect.width, { timeout: 10_000 })
    .toBeGreaterThan(0)
  const drawn = await savedCallout()
  expect(drawn.tail).toEqual({ x: 200, y: 250 })
  expect(drawn.rect.y + drawn.rect.height).toBeCloseTo(150, 0)

  // A click with no drag aims at nothing, so it leaves the capture alone.
  await page.mouse.click(box.x + 350, box.y + 200)
  await expect
    .poll(async () => (await savedAnnotations()) as readonly unknown[], { timeout: 10_000 })
    .toHaveLength(1)

  // Drag the bubble itself: it travels alone, the tail stretching to keep
  // pointing at the same spot on the capture.
  const centre = {
    x: box.x + drawn.rect.x + drawn.rect.width / 2,
    y: box.y + drawn.rect.y + drawn.rect.height / 2,
  }
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move(centre.x + 50, centre.y + 60, { steps: 10 })
  await page.mouse.up()

  await expect
    .poll(async () => (await savedCallout())?.rect.x, { timeout: 10_000 })
    .toBeCloseTo(drawn.rect.x + 50, 0)
  const moved = await savedCallout()
  expect(moved.rect.y).toBeCloseTo(drawn.rect.y + 60, 0)
  expect(moved.rect.width).toBeCloseTo(drawn.rect.width, 0)
  expect(moved.tail.x).toBeCloseTo(drawn.tail.x, 0)
  expect(moved.tail.y).toBeCloseTo(drawn.tail.y, 0)

  // Undo returns it to where it was drawn, as one step.
  await page.keyboard.press('Meta+z')
  await expect
    .poll(async () => (await savedCallout())?.rect.x, { timeout: 10_000 })
    .toBeCloseTo(drawn.rect.x, 0)

  // The badge straddles the bubble's top-right corner.
  await page.mouse.click(
    box.x + drawn.rect.x + drawn.rect.width,
    box.y + drawn.rect.y,
  )
  await expect
    .poll(async () => savedAnnotations(), { timeout: 10_000 })
    .toEqual([])
})

test('a callout resizes from its handles, resizing its text to match', async () => {
  await sendCapture({
    id: 'e2e-callout-resize',
    dataUrl: ONE_PIXEL_PNG,
    width: 400,
    height: 300,
    createdAt: new Date().toISOString(),
  })

  const page = await app.firstWindow()
  await expect(page.locator('#empty')).toBeHidden()
  await page.getByRole('button', { name: 'Callout' }).click()

  const box = await page.locator('#canvas').boundingBox()
  if (!box) throw new Error('canvas has no bounding box')
  const at = (x: number, y: number): { x: number; y: number } => ({
    x: box.x + x,
    y: box.y + y,
  })

  async function drag(from: { x: number; y: number }, to: { x: number; y: number }) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 10 })
    await page.mouse.up()
  }

  await drag(at(200, 250), at(120, 150))
  await expect
    .poll(async () => (await savedCallout())?.rect.width, { timeout: 10_000 })
    .toBeGreaterThan(0)
  const drawn = await savedCallout()
  const centre = at(
    drawn.rect.x + drawn.rect.width / 2,
    drawn.rect.y + drawn.rect.height / 2,
  )

  // Write a note so there is text to re-size with the bubble.
  await page.mouse.click(centre.x, centre.y)
  await page.keyboard.type('resize me')
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => (await savedCallout())?.text, { timeout: 10_000 })
    .toBe('resize me')
  const typed = await savedCallout()

  // Drag the south-east handle out: the bubble grows and so does its text.
  const southEast = at(
    drawn.rect.x + drawn.rect.width,
    drawn.rect.y + drawn.rect.height,
  )
  await drag(southEast, { x: southEast.x + 100, y: southEast.y + 100 })
  await expect
    .poll(async () => (await savedCallout())?.rect.height, { timeout: 10_000 })
    .toBeCloseTo(drawn.rect.height + 100, 0)
  const enlarged = await savedCallout()
  expect(enlarged.rect.width).toBeCloseTo(drawn.rect.width + 100, 0)
  expect(enlarged.fontSize).toBeGreaterThan(typed.fontSize)
  // The tail tip stays on what the note points at while the bubble grows.
  expect(enlarged.tail).toEqual(drawn.tail)
})

test('a callout is drawn empty, then clicked to write and rewrite its note', async () => {
  await sendCapture({
    id: 'e2e-callout',
    dataUrl: ONE_PIXEL_PNG,
    width: 400,
    height: 300,
    createdAt: new Date().toISOString(),
  })

  const page = await app.firstWindow()
  await expect(page.locator('#empty')).toBeHidden()
  await page.getByRole('button', { name: 'Callout' }).click()

  const canvas = page.locator('#canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no bounding box')

  await page.mouse.move(box.x + 200, box.y + 250)
  await page.mouse.down()
  await page.mouse.move(box.x + 120, box.y + 150)
  await page.mouse.up()

  // The drag commits the bubble on its own, with no field in the way.
  const note = page.locator('#callout-input')
  await expect(note).toBeHidden()
  await expect
    .poll(async () => savedAnnotations(), { timeout: 10_000 })
    .toMatchObject([{ kind: 'callout', text: '' }])

  // Any tool can write the note, not just Callout.
  await page.getByRole('button', { name: 'Box' }).click()
  const drawn = await savedCallout()
  const insideBubble = {
    x: box.x + drawn.rect.x + drawn.rect.width / 2,
    y: box.y + drawn.rect.y + drawn.rect.height / 2,
  }
  await page.mouse.click(insideBubble.x, insideBubble.y)
  await expect(note).toBeVisible()
  await page.keyboard.type('check this')
  await page.keyboard.press('Enter')
  await expect(note).toBeHidden()
  await expect
    .poll(async () => savedAnnotations(), { timeout: 10_000 })
    .toMatchObject([{ kind: 'callout', text: 'check this' }])

  // Clicking it again reopens the note for editing rather than drawing a box.
  await page.mouse.click(insideBubble.x, insideBubble.y)
  await expect(note).toHaveValue('check this')
  await page.keyboard.type('rewritten')
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => savedAnnotations(), { timeout: 10_000 })
    .toMatchObject([{ kind: 'callout', text: 'rewritten' }])

  // Escape abandons an edit instead of writing it.
  await page.mouse.click(insideBubble.x, insideBubble.y)
  await page.keyboard.type('discarded')
  await page.keyboard.press('Escape')
  await expect(note).toBeHidden()
  await expect
    .poll(async () => savedAnnotations(), { timeout: 10_000 })
    .toMatchObject([{ kind: 'callout', text: 'rewritten' }])
})

/** The single callout in the most recently written document sidecar. */
async function savedCallout(): Promise<{
  rect: { x: number; y: number; width: number; height: number }
  tail: { x: number; y: number }
  text: string
  fontSize: number
}> {
  const annotations = (await savedAnnotations()) as
    | readonly { kind: string }[]
    | undefined
  const callout = annotations?.find((a) => a.kind === 'callout')
  return callout as never
}

/** The annotations of the most recently written document sidecar. */
async function savedAnnotations(): Promise<unknown> {
  const dir = join(captureRoot, '.chop', 'docs')
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) =>
    f.endsWith('.json'),
  )
  const name = files.sort().at(-1)
  if (!name) return undefined
  return JSON.parse(await readFile(join(dir, name), 'utf8')).annotations
}

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

test('dragging an edge in a drawing tool trims the capture on mouse release', async () => {
  await sendCapture({
    id: 'e2e-5',
    dataUrl: ONE_PIXEL_PNG,
    width: 400,
    height: 300,
    createdAt: new Date().toISOString(),
  })

  const page = await app.firstWindow()
  await expect(page.locator('#empty')).toBeHidden()

  // Box is the starting tool: the trim handles have to work without leaving it.
  await expect(page.getByRole('button', { name: 'Box' })).toHaveClass(/active/)

  const canvas = page.locator('#canvas')
  const before = await canvas.boundingBox()
  if (!before) throw new Error('canvas has no bounding box')

  // Grab the south-east corner handle and cut 100px off both edges.
  await page.mouse.move(before.x + before.width - 2, before.y + before.height - 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width - 100, before.y + before.height - 100)
  await page.mouse.up()

  // No Enter, no tool change: releasing the mouse is what applies it.
  await expect(page.getByRole('button', { name: 'Box' })).toHaveClass(/active/)
  await expect
    .poll(async () => (await savedCropRect()) as { width?: number } | null, { timeout: 10_000 })
    .toMatchObject({ width: expect.any(Number) })

  // The view resized to the frame rather than keeping the original canvas.
  const after = await canvas.boundingBox()
  expect(after?.width).toBeLessThan(before.width)
  expect(after?.height).toBeLessThan(before.height)
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
