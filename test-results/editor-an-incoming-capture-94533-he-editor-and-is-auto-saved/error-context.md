# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: editor.spec.ts >> an incoming capture opens the editor and is auto-saved
- Location: tests/e2e/editor.spec.ts:47:1

# Error details

```
Error: expect(locator).toBeHidden() failed

Locator:  locator('#empty')
Expected: hidden
Received: visible
Timeout:  5000ms

Call log:
  - Expect "toBeHidden" with timeout 5000ms
  - waiting for locator('#empty')
    14 × locator resolved to <div id="empty">Press ⌘⇧2 to capture</div>
       - unexpected value "visible"

```

```yaml
- text: Press ⌘⇧2 to capture
```

# Test source

```ts
  1   | import { _electron as electron, type ElectronApplication, expect, test } from '@playwright/test'
  2   | import { mkdtemp, readdir, rm } from 'node:fs/promises'
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
  22  |   await app.evaluate((_electron, payload) => {
  23  |     const send = (globalThis as { __chopSendCapture?: (c: Capture) => void })
  24  |       .__chopSendCapture
  25  |     if (!send) throw new Error('__chopSendCapture seam is missing')
  26  |     send(payload)
  27  |   }, capture)
  28  | }
  29  | 
  30  | test.beforeEach(async () => {
  31  |   captureRoot = await mkdtemp(join(tmpdir(), 'chop-e2e-'))
  32  |   app = await electron.launch({
  33  |     args: ['out/main/index.js'],
  34  |     env: {
  35  |       ...process.env,
  36  |       CHOP_CAPTURE_ROOT: captureRoot,
  37  |       CHOP_STUB_WINDOWS: '[]',
  38  |     },
  39  |   })
  40  | })
  41  | 
  42  | test.afterEach(async () => {
  43  |   await app.close()
  44  |   await rm(captureRoot, { recursive: true, force: true })
  45  | })
  46  | 
  47  | test('an incoming capture opens the editor and is auto-saved', async () => {
  48  |   await sendCapture({
  49  |     id: 'e2e-1',
  50  |     dataUrl: ONE_PIXEL_PNG,
  51  |     width: 1,
  52  |     height: 1,
  53  |     createdAt: new Date().toISOString(),
  54  |   })
  55  | 
  56  |   const page = await app.firstWindow()
  57  |   await expect(page.locator('#canvas')).toBeVisible()
> 58  |   await expect(page.locator('#empty')).toBeHidden()
      |                                        ^ Error: expect(locator).toBeHidden() failed
  59  | 
  60  |   await expect
  61  |     .poll(async () => (await readdir(captureRoot)).filter((f) => f.endsWith('.png')).length, {
  62  |       timeout: 10_000,
  63  |     })
  64  |     .toBeGreaterThan(0)
  65  | })
  66  | 
  67  | test('drawing a box is undoable and lands in the saved document', async () => {
  68  |   await sendCapture({
  69  |     id: 'e2e-2',
  70  |     dataUrl: ONE_PIXEL_PNG,
  71  |     width: 400,
  72  |     height: 300,
  73  |     createdAt: new Date().toISOString(),
  74  |   })
  75  | 
  76  |   const page = await app.firstWindow()
  77  |   await expect(page.locator('#empty')).toBeHidden()
  78  |   await page.getByRole('button', { name: 'Box' }).click()
  79  | 
  80  |   const canvas = page.locator('#canvas')
  81  |   const box = await canvas.boundingBox()
  82  |   if (!box) throw new Error('canvas has no bounding box')
  83  | 
  84  |   await page.mouse.move(box.x + 20, box.y + 20)
  85  |   await page.mouse.down()
  86  |   await page.mouse.move(box.x + 120, box.y + 90)
  87  |   await page.mouse.up()
  88  | 
  89  |   await expect
  90  |     .poll(async () => (await readdir(join(captureRoot, '.chop', 'docs'))).length, {
  91  |       timeout: 10_000,
  92  |     })
  93  |     .toBeGreaterThan(0)
  94  | 
  95  |   await page.keyboard.press('Meta+z')
  96  |   // The tool stays selected after an undo; only the document changes.
  97  |   await expect(page.getByRole('button', { name: 'Box' })).toHaveClass(/active/)
  98  | })
  99  | 
  100 | test('the tray keeps the app alive after the editor closes', async () => {
  101 |   await sendCapture({
  102 |     id: 'e2e-3',
  103 |     dataUrl: ONE_PIXEL_PNG,
  104 |     width: 1,
  105 |     height: 1,
  106 |     createdAt: new Date().toISOString(),
  107 |   })
  108 |   await app.firstWindow()
  109 | 
  110 |   await app.evaluate(({ BrowserWindow }) => {
  111 |     for (const window of BrowserWindow.getAllWindows()) window.destroy()
  112 |   })
  113 | 
  114 |   // Reaching the main process at all proves it did not quit with its last window.
  115 |   const remaining = await app.evaluate(
  116 |     ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
  117 |   )
  118 |   expect(remaining).toBe(0)
  119 | })
  120 | 
```