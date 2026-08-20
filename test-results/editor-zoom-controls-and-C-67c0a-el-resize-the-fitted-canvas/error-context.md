# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editor.spec.ts >> zoom controls and Command+wheel resize the fitted canvas
- Location: tests/e2e/editor.spec.ts:81:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('#canvas')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('#canvas')

```

```yaml
- text: Click a window · Drag a region · Esc to cancel
```

# Test source

```ts
  1   | import { _electron as electron, type ElectronApplication, expect, test } from '@playwright/test'
  2   | import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
  3   | import { tmpdir } from 'node:os'
  4   | import { join } from 'node:path'
  5   | 
  6   | let app: ElectronApplication
  7   | let captureRoot: string
  8   | 
  9   | const ONE_PIXEL_PNG =
  10  |   'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  11  | 
  12  | type Capture = {
  13  |   id: string
  14  |   dataUrl: string
  15  |   width: number
  16  |   height: number
  17  |   createdAt: string
  18  | }
  19  | 
  20  | /** Drives the editor the way main does, bypassing real screen capture. */
  21  | async function sendCapture(capture: Capture): Promise<void> {
  22  |   await expect
  23  |     .poll(() =>
  24  |       app.evaluate(() =>
  25  |         typeof (globalThis as { __chopSendCapture?: unknown }).__chopSendCapture === 'function',
  26  |       ),
  27  |     )
  28  |     .toBe(true)
  29  |   await app.evaluate((_electron, payload) => {
  30  |     const send = (globalThis as { __chopSendCapture?: (c: Capture) => void })
  31  |       .__chopSendCapture
  32  |     if (!send) throw new Error('__chopSendCapture seam is missing')
  33  |     send(payload)
  34  |   }, capture)
  35  | }
  36  | 
  37  | test.beforeEach(async () => {
  38  |   captureRoot = await mkdtemp(join(tmpdir(), 'chop-e2e-'))
  39  |   // Cursor/agent shells may set ELECTRON_RUN_AS_NODE=1, which makes Electron
  40  |   // reject Playwright's --remote-debugging-port and fail to launch.
  41  |   const { ELECTRON_RUN_AS_NODE: _ignored, ...env } = process.env
  42  |   app = await electron.launch({
  43  |     args: ['out/main/index.js'],
  44  |     env: {
  45  |       ...env,
  46  |       CHOP_CAPTURE_ROOT: captureRoot,
  47  |       CHOP_STUB_WINDOWS: '[]',
  48  |     },
  49  |   })
  50  | })
  51  | 
  52  | test.afterEach(async () => {
  53  |   await app?.close()
  54  |   await rm(captureRoot, { recursive: true, force: true })
  55  | })
  56  | 
  57  | test('an incoming capture opens the editor and is auto-saved', async () => {
  58  |   await sendCapture({
  59  |     id: 'e2e-1',
  60  |     dataUrl: ONE_PIXEL_PNG,
  61  |     width: 1,
  62  |     height: 1,
  63  |     createdAt: new Date().toISOString(),
  64  |   })
  65  | 
  66  |   const page = await app.firstWindow()
  67  |   await expect(page.locator('#canvas')).toBeVisible()
  68  |   await expect(page.locator('#empty')).toBeHidden()
  69  | 
  70  |   await expect
  71  |     .poll(async () => (await readdir(captureRoot)).filter((f) => f.endsWith('.png')).length, {
  72  |       timeout: 10_000,
  73  |     })
  74  |     .toBeGreaterThan(0)
  75  | 
  76  |   // The history bar must include the capture that is currently open.
  77  |   await expect(page.locator('#filmstrip .thumb.active')).toBeVisible({ timeout: 10_000 })
  78  |   await expect(page.locator('#filmstrip .thumb.active img')).toHaveAttribute('src', /data:image/)
  79  | })
  80  | 
  81  | test('zoom controls and Command+wheel resize the fitted canvas', async () => {
  82  |   await sendCapture({
  83  |     id: 'e2e-zoom',
  84  |     dataUrl: ONE_PIXEL_PNG,
  85  |     width: 400,
  86  |     height: 300,
  87  |     createdAt: new Date().toISOString(),
  88  |   })
  89  | 
  90  |   const page = await app.firstWindow()
  91  |   const canvas = page.locator('#canvas')
  92  |   const zoomLevel = page.locator('#zoom-level')
> 93  |   await expect(canvas).toBeVisible()
      |                        ^ Error: expect(locator).toBeVisible() failed
  94  |   await expect(zoomLevel).toHaveText('100%')
  95  | 
  96  |   const initial = await canvas.boundingBox()
  97  |   if (!initial) throw new Error('canvas has no bounding box')
  98  | 
  99  |   await page.getByRole('button', { name: 'Zoom in' }).click()
  100 |   await expect(zoomLevel).toHaveText('110%')
  101 |   await expect
  102 |     .poll(async () => (await canvas.boundingBox())?.width)
  103 |     .toBeCloseTo(initial.width * 1.1, 0)
  104 | 
  105 |   const zoomed = await canvas.boundingBox()
  106 |   if (!zoomed) throw new Error('zoomed canvas has no bounding box')
  107 |   await page.mouse.move(zoomed.x + zoomed.width / 2, zoomed.y + zoomed.height / 2)
  108 |   await page.keyboard.down('Meta')
  109 |   await page.mouse.wheel(0, 100)
  110 |   await page.keyboard.up('Meta')
  111 |   await expect(zoomLevel).toHaveText('100%')
  112 | 
  113 |   await page.getByRole('button', { name: 'Zoom in' }).click()
  114 |   await page.getByRole('button', { name: 'Reset zoom' }).click()
  115 |   await expect(zoomLevel).toHaveText('100%')
  116 | })
  117 | 
  118 | test('drawing a box is undoable and lands in the saved document', async () => {
  119 |   await sendCapture({
  120 |     id: 'e2e-2',
  121 |     dataUrl: ONE_PIXEL_PNG,
  122 |     width: 400,
  123 |     height: 300,
  124 |     createdAt: new Date().toISOString(),
  125 |   })
  126 | 
  127 |   const page = await app.firstWindow()
  128 |   await expect(page.locator('#empty')).toBeHidden()
  129 |   await page.getByRole('button', { name: 'Box' }).click()
  130 | 
  131 |   const canvas = page.locator('#canvas')
  132 |   const box = await canvas.boundingBox()
  133 |   if (!box) throw new Error('canvas has no bounding box')
  134 | 
  135 |   await page.mouse.move(box.x + 20, box.y + 20)
  136 |   await page.mouse.down()
  137 |   await page.mouse.move(box.x + 120, box.y + 90)
  138 |   await page.mouse.up()
  139 | 
  140 |   await expect
  141 |     .poll(async () => (await readdir(join(captureRoot, '.chop', 'docs'))).length, {
  142 |       timeout: 10_000,
  143 |     })
  144 |     .toBeGreaterThan(0)
  145 | 
  146 |   await page.keyboard.press('Meta+z')
  147 |   // The tool stays selected after an undo; only the document changes.
  148 |   await expect(page.getByRole('button', { name: 'Box' })).toHaveClass(/active/)
  149 | })
  150 | 
  151 | test('a placed box can be moved and resized in any tool mode', async () => {
  152 |   await sendCapture({
  153 |     id: 'e2e-box-edit',
  154 |     dataUrl: ONE_PIXEL_PNG,
  155 |     width: 400,
  156 |     height: 300,
  157 |     createdAt: new Date().toISOString(),
  158 |   })
  159 | 
  160 |   const page = await app.firstWindow()
  161 |   await expect(page.locator('#empty')).toBeHidden()
  162 |   await page.getByRole('button', { name: 'Box' }).click()
  163 | 
  164 |   const canvas = page.locator('#canvas')
  165 |   const box = await canvas.boundingBox()
  166 |   if (!box) throw new Error('canvas has no bounding box')
  167 | 
  168 |   // Draw a box from (20,20) to (120,90) in canvas space.
  169 |   await page.mouse.move(box.x + 20, box.y + 20)
  170 |   await page.mouse.down()
  171 |   await page.mouse.move(box.x + 120, box.y + 90)
  172 |   await page.mouse.up()
  173 | 
  174 |   await expect
  175 |     .poll(async () => (await savedBox())?.rect.width, { timeout: 10_000 })
  176 |     .toBeGreaterThan(0)
  177 |   const drawn = await savedBox()
  178 | 
  179 |   // Switch away from Box — editing must still work, like callouts.
  180 |   await page.getByRole('button', { name: 'Arrow' }).click()
  181 | 
  182 |   // Drag the body to the right.
  183 |   await page.mouse.move(box.x + 70, box.y + 55)
  184 |   await page.mouse.down()
  185 |   await page.mouse.move(box.x + 120, box.y + 55, { steps: 8 })
  186 |   await page.mouse.up()
  187 | 
  188 |   await expect
  189 |     .poll(async () => (await savedBox())?.rect.x, { timeout: 10_000 })
  190 |     .toBeCloseTo(drawn.rect.x + 50, 0)
  191 | 
  192 |   const moved = await savedBox()
  193 | 
```