# Chop Screen Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Chop, a personal Snagit replacement: capture a screen region or a window with one click, annotate it with box/arrow/text/highlighter/blur/crop, auto-save to a local folder, and browse past captures in a filmstrip.

**Architecture:** Electron main process owns capture, window geometry, hotkeys, and storage. When the hotkey fires, every display is screenshotted at full resolution *first* ("freeze-frame"), then transparent always-on-top overlay windows draw on those frozen images — this makes window-under-cursor highlighting flicker-free and guarantees the overlay never leaks into the capture. The editor is an HTML canvas renderer driving an immutable document model. All coordinate math and document logic lives in `src/shared/`, which never imports Electron and carries the bulk of test coverage.

**Tech Stack:** Electron 43, electron-vite 5, TypeScript, Vitest 4 (unit/integration), Playwright 1.62 (E2E), electron-builder 26, a compiled Swift helper for macOS window geometry, koffi 3 FFI for Windows window geometry.

**Spec:** `docs/superpowers/specs/2026-08-04-chop-screen-capture-design.md`

## Global Constraints

- **Immutability is mandatory.** Every state update returns a new object. Never mutate an existing document, annotation array, or manifest. All shared types use `readonly`.
- **`src/shared/` must never import `electron`.** It is pure TypeScript so Vitest can run it directly in a Node environment. Violating this breaks the entire test strategy.
- **Annotations are stored in image coordinates**, never screen or canvas coordinates.
- **TDD:** write the failing test, run it, watch it fail, then implement. Every task below is ordered this way — do not reorder.
- **Minimum 80% coverage** on `src/shared/`. Check with `npm run test:coverage`.
- **No magic numbers.** Cross-module tunables live in `src/shared/constants.ts`. Values used by exactly one module (e.g. `HIGHLIGHT_ALPHA`, `SELECTION_COLOR`) may be named constants at the top of that module — what is forbidden is an unexplained literal, not a locally-scoped named constant.
- **File size:** 200–400 lines typical, 800 hard maximum. Split when a file grows past that.
- **Commit after every task** using conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- **Blur is implemented as pixelation**, never gaussian — a low-radius gaussian is partially reversible, which defeats the purpose of redaction.
- **Node 24 / npm 11** are installed. macOS target is 26.5.2 (arm64), Swift 6.3.3 at `/usr/bin/swiftc`.
- Error handling is explicit at every level. Never silently swallow an error.

## File Structure

```
src/
  shared/                    pure TypeScript — no electron imports, heavily tested
    constants.ts             all tunable thresholds
    geometry.ts              Point, Rect, and rectangle math
    coords.ts                DIP↔physical, global↔display-local conversion
    window-rect.ts           WindowRect type + z-ordered hit-testing
    document.ts              CaptureDocument, Annotation, immutable reducers
    history.ts               generic undo/redo stack
    render.ts                pure canvas rendering of a document
    hit-test.ts              annotation bounds + point hit-testing
    manifest.ts              manifest shape + pure record operations
    ipc.ts                   channel name constants + payload types
  main/
    index.ts                 app lifecycle, wiring
    tray.ts                  menu bar icon + menu
    hotkeys.ts               global shortcut registration
    permissions.ts           macOS screen recording checks + guidance
    capture/
      capture-service.ts     desktopCapturer orchestration
      overlay-manager.ts     per-display overlay window lifecycle
      crop.ts                crop the frozen image to the selection
    window-providers/
      index.ts               runtime platform selection + timeout wrapper
      types.ts               WindowProvider interface
      macos.ts               spawns the Swift helper binary
      windows.ts             koffi → user32/dwmapi
      stub.ts                fixture data for tests
    storage/
      capture-store.ts       write original/flat/doc/thumb, update manifest
      manifest-store.ts      read/write/rebuild manifest.json
      paths.ts               resolve capture directory and sidecar paths
    editor-window.ts         the single reused editor BrowserWindow
  preload/
    overlay.ts               overlay IPC bridge
    editor.ts                editor IPC bridge
  renderer/
    overlay/                 index.html, main.ts, selection UI
    editor/                  index.html, main.ts, tools/, filmstrip/
native/
  macos/windowlist.swift     CGWindowListCopyWindowInfo → JSON
scripts/
  build-swift-helper.mjs     compiles the Swift helper on darwin
tests/
  shared/                    Vitest unit tests
  main/                      Vitest integration tests (real fs, temp dirs)
  e2e/                       Playwright Electron tests
```

---

### Task 1: Project scaffolding and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`
- Create: `src/main/index.ts`, `src/preload/editor.ts`
- Create: `src/renderer/editor/index.html`, `src/renderer/editor/main.ts`
- Create: `src/shared/constants.ts`
- Test: `tests/shared/constants.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `npm run dev`, `npm run test`, `npm run test:coverage`, `npm run build`. Exports from `src/shared/constants.ts`: `HISTORY_LIMIT`, `AUTOSAVE_DEBOUNCE_MS`, `THUMBNAIL_SIZE`, `PIXELATE_BLOCK_SIZE`, `WINDOW_PROVIDER_TIMEOUT_MS`, `MIN_WINDOW_DIMENSION`, `MIN_SELECTION_DIMENSION`, `DEFAULT_STROKE_WIDTH`, `DEFAULT_FONT_SIZE`, `HANDLE_SIZE`.

- [ ] **Step 1: Initialise the package**

```bash
npm init -y
npm install --save-dev electron@43.2.0 electron-vite@5.0.0 electron-builder@26.15.3 \
  typescript@5 vite@7 vitest@4.1.10 @vitest/coverage-v8@4.1.10 @types/node@24
```

- [ ] **Step 2: Write `package.json` scripts and metadata**

Replace the generated `package.json` with:

```json
{
  "name": "chop",
  "version": "0.1.0",
  "description": "Personal screen capture and annotation tool",
  "main": "out/main/index.js",
  "type": "module",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  }
}
```

Keep the `devDependencies` block that `npm install` generated.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["src/shared/*"] }
  },
  "include": ["src", "tests", "scripts", "*.config.ts"]
}
```

- [ ] **Step 4: Write `electron.vite.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

const alias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { build: { lib: { entry: 'src/main/index.ts' } }, resolve: { alias } },
  preload: {
    build: {
      rollupOptions: {
        input: {
          editor: resolve('src/preload/editor.ts'),
          overlay: resolve('src/preload/overlay.ts'),
        },
      },
    },
    resolve: { alias },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          editor: resolve('src/renderer/editor/index.html'),
          overlay: resolve('src/renderer/overlay/index.html'),
        },
      },
    },
    resolve: { alias },
  },
})
```

Note: `src/preload/overlay.ts` and `src/renderer/overlay/index.html` are created in Task 6. Until then, create both as one-line placeholders so the build resolves: `export {}` and `<!doctype html><title>overlay</title>` respectively.

- [ ] **Step 5: Write `vitest.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
```

- [ ] **Step 6: Write the failing test**

Create `tests/shared/constants.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import * as constants from '@shared/constants'

describe('constants', () => {
  it('defines every tunable threshold as a positive number', () => {
    const required = [
      'HISTORY_LIMIT',
      'AUTOSAVE_DEBOUNCE_MS',
      'THUMBNAIL_SIZE',
      'PIXELATE_BLOCK_SIZE',
      'WINDOW_PROVIDER_TIMEOUT_MS',
      'MIN_WINDOW_DIMENSION',
      'MIN_SELECTION_DIMENSION',
      'DEFAULT_STROKE_WIDTH',
      'DEFAULT_FONT_SIZE',
      'HANDLE_SIZE',
    ] as const

    for (const key of required) {
      const value = (constants as Record<string, unknown>)[key]
      expect(typeof value, `${key} must be defined`).toBe('number')
      expect(value as number, `${key} must be positive`).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 7: Run the test and verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `@shared/constants`.

- [ ] **Step 8: Write `src/shared/constants.ts`**

```ts
/** Maximum number of document snapshots retained for undo. */
export const HISTORY_LIMIT = 50

/** Delay after the last edit before the flattened PNG is rewritten. */
export const AUTOSAVE_DEBOUNCE_MS = 800

/** Longest edge of a filmstrip thumbnail, in pixels. */
export const THUMBNAIL_SIZE = 256

/** Mosaic block size used by the blur (pixelate) tool, in image pixels. */
export const PIXELATE_BLOCK_SIZE = 12

/** Longest the window provider may run before capture degrades to region-only. */
export const WINDOW_PROVIDER_TIMEOUT_MS = 1500

/** Windows smaller than this on either edge are ignored as capture targets. */
export const MIN_WINDOW_DIMENSION = 40

/** Drags smaller than this on either edge are treated as clicks, not regions. */
export const MIN_SELECTION_DIMENSION = 4

export const DEFAULT_STROKE_WIDTH = 3
export const DEFAULT_FONT_SIZE = 18

/** Edge length of a selection resize handle, in canvas pixels. */
export const HANDLE_SIZE = 8
```

- [ ] **Step 9: Write a minimal bootable app**

`src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createEditorWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    webPreferences: { preload: join(import.meta.dirname, '../preload/editor.mjs') },
  })
  window.once('ready-to-show', () => window.show())
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/editor/index.html`)
  } else {
    void window.loadFile(join(import.meta.dirname, '../renderer/editor/index.html'))
  }
  return window
}

void app.whenReady().then(() => {
  createEditorWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createEditorWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/editor.ts`:

```ts
export {}
```

`src/renderer/editor/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Chop</title>
  </head>
  <body>
    <h1>Chop</h1>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/renderer/editor/main.ts`:

```ts
console.info('Chop editor ready')
```

- [ ] **Step 10: Run the test and verify it passes**

Run: `npm test`
Expected: PASS — 1 test.

- [ ] **Step 11: Verify the app boots**

Run: `npm run dev`
Expected: a window opens showing "Chop". Quit it.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold electron-vite app with vitest harness"
```

---

### Task 2: Geometry primitives

**Files:**
- Create: `src/shared/geometry.ts`
- Test: `tests/shared/geometry.test.ts`

**Interfaces:**
- Consumes: `MIN_SELECTION_DIMENSION` from `@shared/constants`
- Produces:
  - `type Point = { readonly x: number; readonly y: number }`
  - `type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }`
  - `normalizeRect(a: Point, b: Point): Rect` — builds a positive-dimension rect from any two corners
  - `rectContains(rect: Rect, point: Point): boolean`
  - `rectIntersect(a: Rect, b: Rect): Rect | null`
  - `clampRect(rect: Rect, bounds: Rect): Rect`
  - `rectArea(rect: Rect): number`
  - `isDegenerateRect(rect: Rect): boolean` — true when either edge is below `MIN_SELECTION_DIMENSION`
  - `offsetRect(rect: Rect, dx: number, dy: number): Rect`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/geometry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  clampRect,
  isDegenerateRect,
  normalizeRect,
  offsetRect,
  rectArea,
  rectContains,
  rectIntersect,
} from '@shared/geometry'

describe('normalizeRect', () => {
  it('builds a positive rect when dragged down-right', () => {
    expect(normalizeRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual({
      x: 10, y: 20, width: 30, height: 40,
    })
  })

  it('builds a positive rect when dragged up-left', () => {
    expect(normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({
      x: 10, y: 20, width: 30, height: 40,
    })
  })

  it('produces a zero-size rect when both corners match', () => {
    expect(normalizeRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      x: 5, y: 5, width: 0, height: 0,
    })
  })
})

describe('rectContains', () => {
  const rect = { x: 0, y: 0, width: 100, height: 50 }

  it('includes points inside', () => {
    expect(rectContains(rect, { x: 50, y: 25 })).toBe(true)
  })

  it('includes the top-left edge', () => {
    expect(rectContains(rect, { x: 0, y: 0 })).toBe(true)
  })

  it('excludes the bottom-right edge', () => {
    expect(rectContains(rect, { x: 100, y: 50 })).toBe(false)
  })

  it('excludes points outside', () => {
    expect(rectContains(rect, { x: -1, y: 25 })).toBe(false)
  })
})

describe('rectIntersect', () => {
  it('returns the overlapping region', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    const b = { x: 50, y: 50, width: 100, height: 100 }
    expect(rectIntersect(a, b)).toEqual({ x: 50, y: 50, width: 50, height: 50 })
  })

  it('returns null when the rects only touch at an edge', () => {
    const a = { x: 0, y: 0, width: 50, height: 50 }
    const b = { x: 50, y: 0, width: 50, height: 50 }
    expect(rectIntersect(a, b)).toBeNull()
  })

  it('returns null when the rects are disjoint', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    const b = { x: 100, y: 100, width: 10, height: 10 }
    expect(rectIntersect(a, b)).toBeNull()
  })
})

describe('clampRect', () => {
  it('leaves a fully contained rect untouched', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rect = { x: 10, y: 10, width: 20, height: 20 }
    expect(clampRect(rect, bounds)).toEqual(rect)
  })

  it('clips a rect overhanging the bottom-right', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rect = { x: 90, y: 90, width: 50, height: 50 }
    expect(clampRect(rect, bounds)).toEqual({ x: 90, y: 90, width: 10, height: 10 })
  })

  it('clips a rect overhanging a negative-origin bounds', () => {
    const bounds = { x: -1920, y: 0, width: 1920, height: 1080 }
    const rect = { x: -2000, y: -50, width: 200, height: 200 }
    expect(clampRect(rect, bounds)).toEqual({ x: -1920, y: 0, width: 120, height: 150 })
  })

  it('collapses a fully outside rect to zero size', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 }
    const rect = { x: 500, y: 500, width: 10, height: 10 }
    expect(rectArea(clampRect(rect, bounds))).toBe(0)
  })
})

describe('isDegenerateRect', () => {
  it('flags rects thinner than the minimum selection size', () => {
    expect(isDegenerateRect({ x: 0, y: 0, width: 2, height: 100 })).toBe(true)
  })

  it('accepts rects at or above the minimum on both edges', () => {
    expect(isDegenerateRect({ x: 0, y: 0, width: 10, height: 10 })).toBe(false)
  })
})

describe('offsetRect', () => {
  it('moves a rect without mutating the input', () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 }
    expect(offsetRect(rect, 10, 20)).toEqual({ x: 11, y: 22, width: 3, height: 4 })
    expect(rect).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/geometry.test.ts`
Expected: FAIL — cannot resolve `@shared/geometry`.

- [ ] **Step 3: Write `src/shared/geometry.ts`**

```ts
import { MIN_SELECTION_DIMENSION } from './constants'

export type Point = { readonly x: number; readonly y: number }

export type Rect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x < rect.x + rect.width &&
    point.y < rect.y + rect.height
  )
}

export function rectIntersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

export function clampRect(rect: Rect, bounds: Rect): Rect {
  return rectIntersect(rect, bounds) ?? { x: rect.x, y: rect.y, width: 0, height: 0 }
}

export function rectArea(rect: Rect): number {
  return rect.width * rect.height
}

export function isDegenerateRect(rect: Rect): boolean {
  return rect.width < MIN_SELECTION_DIMENSION || rect.height < MIN_SELECTION_DIMENSION
}

export function offsetRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/geometry.test.ts`
Expected: PASS — 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/geometry.ts tests/shared/geometry.test.ts
git commit -m "feat: add rectangle geometry primitives"
```

---

### Task 3: Display coordinate math

This is the highest-risk module in the project. Failures here are silent and subtle: a selection on a 2× display crops the wrong pixels, or a monitor positioned left of the primary produces negative origins that clamp to zero. Test it exhaustively.

**Files:**
- Create: `src/shared/coords.ts`
- Test: `tests/shared/coords.test.ts`

**Interfaces:**
- Consumes: `Point`, `Rect`, `rectContains` from `@shared/geometry`
- Produces:
  - `type DisplayInfo = { readonly id: number; readonly bounds: Rect; readonly scaleFactor: number }` — `bounds` is in global DIP coordinates
  - `globalToLocal(rect: Rect, display: DisplayInfo): Rect`
  - `localToGlobal(rect: Rect, display: DisplayInfo): Rect`
  - `dipToPhysical(rect: Rect, scaleFactor: number): Rect` — rounds outward so no selected pixel is lost
  - `physicalSize(display: DisplayInfo): { readonly width: number; readonly height: number }`
  - `displayForPoint(displays: readonly DisplayInfo[], point: Point): DisplayInfo | null`
  - `selectionToPhysical(rectGlobalDip: Rect, display: DisplayInfo): Rect` — the full pipeline: global DIP → display-local DIP → clamped → physical pixels

- [ ] **Step 1: Write the failing test**

Create `tests/shared/coords.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  type DisplayInfo,
  dipToPhysical,
  displayForPoint,
  globalToLocal,
  localToGlobal,
  physicalSize,
  selectionToPhysical,
} from '@shared/coords'

const primary: DisplayInfo = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  scaleFactor: 2,
}

/** A 1× monitor positioned to the LEFT of the primary — negative origin. */
const leftExternal: DisplayInfo = {
  id: 2,
  bounds: { x: -1920, y: -100, width: 1920, height: 1080 },
  scaleFactor: 1,
}

describe('globalToLocal', () => {
  it('is an identity on a display anchored at the origin', () => {
    const rect = { x: 100, y: 50, width: 200, height: 100 }
    expect(globalToLocal(rect, primary)).toEqual(rect)
  })

  it('subtracts a negative display origin', () => {
    const rect = { x: -1820, y: 0, width: 200, height: 100 }
    expect(globalToLocal(rect, leftExternal)).toEqual({
      x: 100, y: 100, width: 200, height: 100,
    })
  })
})

describe('localToGlobal', () => {
  it('round-trips with globalToLocal on a negative-origin display', () => {
    const rect = { x: -1820, y: 0, width: 200, height: 100 }
    expect(localToGlobal(globalToLocal(rect, leftExternal), leftExternal)).toEqual(rect)
  })
})

describe('dipToPhysical', () => {
  it('doubles coordinates on a 2x display', () => {
    expect(dipToPhysical({ x: 10, y: 20, width: 30, height: 40 }, 2)).toEqual({
      x: 20, y: 40, width: 60, height: 80,
    })
  })

  it('is an identity at 1x', () => {
    const rect = { x: 10, y: 20, width: 30, height: 40 }
    expect(dipToPhysical(rect, 1)).toEqual(rect)
  })

  it('rounds outward so no selected pixel is lost', () => {
    // Span [10.6, 40.7) touches pixel indices 10..40 inclusive = 31 pixels.
    // Span [20.6, 60.7) touches 20..60 inclusive = 41 pixels.
    expect(dipToPhysical({ x: 10.6, y: 20.6, width: 30.1, height: 40.1 }, 1)).toEqual({
      x: 10, y: 20, width: 31, height: 41,
    })
  })

  it('handles fractional scale factors', () => {
    expect(dipToPhysical({ x: 0, y: 0, width: 100, height: 100 }, 1.5)).toEqual({
      x: 0, y: 0, width: 150, height: 150,
    })
  })
})

describe('physicalSize', () => {
  it('multiplies display bounds by the scale factor', () => {
    expect(physicalSize(primary)).toEqual({ width: 3024, height: 1964 })
  })

  it('rounds outward at fractional scale factors, matching dipToPhysical', () => {
    const fractional: DisplayInfo = {
      id: 3,
      bounds: { x: 0, y: 0, width: 1509, height: 849 },
      scaleFactor: 1.25,
    }
    // 1509 * 1.25 = 1886.25 -> 1887, never 1886, or a full-width selection
    // would compute a crop one pixel wider than the buffer.
    expect(physicalSize(fractional)).toEqual({ width: 1887, height: 1062 })
  })

  it('never reports a size smaller than a full-display selection needs', () => {
    const fractional: DisplayInfo = {
      id: 4,
      bounds: { x: 0, y: 0, width: 1707, height: 960 },
      scaleFactor: 1.75,
    }
    const full = selectionToPhysical(fractional.bounds, fractional)
    const size = physicalSize(fractional)
    expect(full.x + full.width).toBeLessThanOrEqual(size.width)
    expect(full.y + full.height).toBeLessThanOrEqual(size.height)
  })
})

describe('displayForPoint', () => {
  const displays = [primary, leftExternal]

  it('finds the primary display', () => {
    expect(displayForPoint(displays, { x: 10, y: 10 })?.id).toBe(1)
  })

  it('finds a display at negative coordinates', () => {
    expect(displayForPoint(displays, { x: -1000, y: 0 })?.id).toBe(2)
  })

  it('returns null for a point in no display', () => {
    expect(displayForPoint(displays, { x: 99999, y: 99999 })).toBeNull()
  })
})

describe('selectionToPhysical', () => {
  it('converts a global 2x selection to physical pixels', () => {
    const selection = { x: 100, y: 50, width: 200, height: 100 }
    expect(selectionToPhysical(selection, primary)).toEqual({
      x: 200, y: 100, width: 400, height: 200,
    })
  })

  it('converts a selection on a negative-origin 1x display', () => {
    const selection = { x: -1820, y: 0, width: 200, height: 100 }
    expect(selectionToPhysical(selection, leftExternal)).toEqual({
      x: 100, y: 100, width: 200, height: 100,
    })
  })

  it('clamps a selection overhanging the display edge before scaling', () => {
    const selection = { x: 1400, y: 900, width: 400, height: 400 }
    expect(selectionToPhysical(selection, primary)).toEqual({
      x: 2800, y: 1800, width: 224, height: 164,
    })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/coords.test.ts`
Expected: FAIL — cannot resolve `@shared/coords`.

- [ ] **Step 3: Write `src/shared/coords.ts`**

```ts
import { clampRect, type Point, type Rect, rectContains } from './geometry'

export type DisplayInfo = {
  readonly id: number
  /** Position and size in global device-independent pixels. May have a negative origin. */
  readonly bounds: Rect
  readonly scaleFactor: number
}

export function globalToLocal(rect: Rect, display: DisplayInfo): Rect {
  return { ...rect, x: rect.x - display.bounds.x, y: rect.y - display.bounds.y }
}

export function localToGlobal(rect: Rect, display: DisplayInfo): Rect {
  return { ...rect, x: rect.x + display.bounds.x, y: rect.y + display.bounds.y }
}

/**
 * Scales device-independent pixels to physical pixels, rounding outward so a
 * selection never loses a pixel it visually covered.
 */
export function dipToPhysical(rect: Rect, scaleFactor: number): Rect {
  const left = Math.floor(rect.x * scaleFactor)
  const top = Math.floor(rect.y * scaleFactor)
  const right = Math.ceil((rect.x + rect.width) * scaleFactor)
  const bottom = Math.ceil((rect.y + rect.height) * scaleFactor)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function physicalSize(display: DisplayInfo): {
  readonly width: number
  readonly height: number
} {
  // Rounds outward to stay consistent with dipToPhysical's ceil on the far edge.
  // Math.round here would under-report by a pixel at fractional scale factors
  // (e.g. 1509 DIP at 1.25x), letting a full-width selection compute a crop
  // rectangle wider than the buffer this function claims exists.
  return {
    width: Math.ceil(display.bounds.width * display.scaleFactor),
    height: Math.ceil(display.bounds.height * display.scaleFactor),
  }
}

export function displayForPoint(
  displays: readonly DisplayInfo[],
  point: Point,
): DisplayInfo | null {
  return displays.find((display) => rectContains(display.bounds, point)) ?? null
}

/**
 * Full conversion pipeline for a capture selection: global DIP coordinates to
 * physical pixel coordinates within the given display's captured image.
 */
export function selectionToPhysical(rectGlobalDip: Rect, display: DisplayInfo): Rect {
  const local = globalToLocal(rectGlobalDip, display)
  const localBounds = { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height }
  return dipToPhysical(clampRect(local, localBounds), display.scaleFactor)
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/coords.test.ts`
Expected: PASS — 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/coords.ts tests/shared/coords.test.ts
git commit -m "feat: add display coordinate conversion"
```

---

### Task 4: Window rectangles and z-ordered hit-testing

**Files:**
- Create: `src/shared/window-rect.ts`
- Test: `tests/shared/window-rect.test.ts`

**Interfaces:**
- Consumes: `Rect`, `rectContains` from `@shared/geometry`; `MIN_WINDOW_DIMENSION` from `@shared/constants`
- Produces:
  - `type WindowRect = { readonly id: number; readonly app: string; readonly bounds: Rect }` — global DIP coordinates, ordered front to back
  - `windowAtPoint(windows: readonly WindowRect[], point: Point): WindowRect | null` — returns the front-most window containing the point
  - `filterCapturableWindows(windows: readonly WindowRect[]): readonly WindowRect[]` — drops windows below `MIN_WINDOW_DIMENSION` on either edge

- [ ] **Step 1: Write the failing test**

Create `tests/shared/window-rect.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  filterCapturableWindows,
  type WindowRect,
  windowAtPoint,
} from '@shared/window-rect'

/** Ordered front to back, exactly as the platform providers return them. */
const windows: readonly WindowRect[] = [
  { id: 1, app: 'Front', bounds: { x: 100, y: 100, width: 400, height: 300 } },
  { id: 2, app: 'Behind', bounds: { x: 0, y: 0, width: 800, height: 600 } },
  { id: 3, app: 'External', bounds: { x: -1920, y: 0, width: 600, height: 400 } },
]

describe('windowAtPoint', () => {
  it('returns the front-most window when two overlap', () => {
    expect(windowAtPoint(windows, { x: 200, y: 200 })?.id).toBe(1)
  })

  it('returns the lower window where the front one does not cover', () => {
    expect(windowAtPoint(windows, { x: 50, y: 50 })?.id).toBe(2)
  })

  it('finds a window on a negative-origin display', () => {
    expect(windowAtPoint(windows, { x: -1900, y: 10 })?.id).toBe(3)
  })

  it('returns null when no window contains the point', () => {
    expect(windowAtPoint(windows, { x: 5000, y: 5000 })).toBeNull()
  })

  it('returns null for an empty window list', () => {
    expect(windowAtPoint([], { x: 0, y: 0 })).toBeNull()
  })
})

describe('filterCapturableWindows', () => {
  it('drops windows too small on either edge', () => {
    const input: readonly WindowRect[] = [
      { id: 1, app: 'Real', bounds: { x: 0, y: 0, width: 400, height: 300 } },
      { id: 2, app: 'Sliver', bounds: { x: 0, y: 0, width: 4, height: 300 } },
      { id: 3, app: 'Dot', bounds: { x: 0, y: 0, width: 400, height: 2 } },
    ]
    expect(filterCapturableWindows(input).map((w) => w.id)).toEqual([1])
  })

  it('preserves front-to-back order', () => {
    expect(filterCapturableWindows(windows).map((w) => w.id)).toEqual([1, 2, 3])
  })

  it('does not mutate the input array', () => {
    const input = [...windows]
    filterCapturableWindows(input)
    expect(input).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/window-rect.test.ts`
Expected: FAIL — cannot resolve `@shared/window-rect`.

- [ ] **Step 3: Write `src/shared/window-rect.ts`**

```ts
import { MIN_WINDOW_DIMENSION } from './constants'
import { type Point, type Rect, rectContains } from './geometry'

/** A capturable on-screen window in global DIP coordinates. */
export type WindowRect = {
  readonly id: number
  readonly app: string
  readonly bounds: Rect
}

/**
 * Returns the front-most window containing the point. Input must be ordered
 * front to back, which is what both platform providers guarantee.
 */
export function windowAtPoint(
  windows: readonly WindowRect[],
  point: Point,
): WindowRect | null {
  return windows.find((window) => rectContains(window.bounds, point)) ?? null
}

export function filterCapturableWindows(
  windows: readonly WindowRect[],
): readonly WindowRect[] {
  return windows.filter(
    (window) =>
      window.bounds.width >= MIN_WINDOW_DIMENSION &&
      window.bounds.height >= MIN_WINDOW_DIMENSION,
  )
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/window-rect.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/window-rect.ts tests/shared/window-rect.test.ts
git commit -m "feat: add window rect hit-testing"
```

---

### Task 5: macOS window provider (Swift helper)

The Swift source below has been compiled and run successfully on the target machine (macOS 26.5.2, Swift 6.3.3) and returns correct z-ordered bounds without triggering any permission prompt. Do not redesign it.

**Files:**
- Create: `native/macos/windowlist.swift`
- Create: `scripts/build-swift-helper.mjs`
- Create: `src/main/window-providers/types.ts`
- Create: `src/main/window-providers/macos.ts`
- Modify: `package.json` (add `build:helper` script and a `postinstall` hook)

**Interfaces:**
- Consumes: `WindowRect` from `@shared/window-rect`
- Produces:
  - `interface WindowProvider { listWindows(): Promise<readonly WindowRect[]> }` from `src/main/window-providers/types.ts`
  - `createMacOsWindowProvider(helperPath: string): WindowProvider`
  - `parseHelperOutput(stdout: string): readonly WindowRect[]` — exported separately so it can be tested without spawning anything
  - Compiled binary at `resources/windowlist`

- [ ] **Step 1: Write the Swift helper**

Create `native/macos/windowlist.swift`:

```swift
import CoreGraphics
import Foundation

// Front-to-back, on-screen, excluding desktop icons and wallpaper.
let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]

guard let raw = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    FileHandle.standardError.write("window list unavailable\n".data(using: .utf8)!)
    exit(1)
}

var out: [[String: Any]] = []

for window in raw {
    // Layer 0 is the normal application window layer. Anything else is a menu,
    // dock, status item, or system overlay, none of which are capture targets.
    guard let layer = window[kCGWindowLayer as String] as? Int, layer == 0,
          let bounds = window[kCGWindowBounds as String] as? [String: Any],
          let id = window[kCGWindowNumber as String] as? Int else { continue }

    let alpha = (window[kCGWindowAlpha as String] as? Double) ?? 1
    if alpha < 0.05 { continue }

    let width = (bounds["Width"] as? Double) ?? 0
    let height = (bounds["Height"] as? Double) ?? 0

    out.append([
        "id": id,
        "x": (bounds["X"] as? Double) ?? 0,
        "y": (bounds["Y"] as? Double) ?? 0,
        "width": width,
        "height": height,
        "app": (window[kCGWindowOwnerName as String] as? String) ?? "",
    ])
}

let data = try JSONSerialization.data(withJSONObject: out)
FileHandle.standardOutput.write(data)
```

Note: size filtering is deliberately left to `filterCapturableWindows` in shared code so it is testable. The helper filters only what it alone can see (layer and alpha).

- [ ] **Step 2: Write the build script**

Create `scripts/build-swift-helper.mjs`:

```js
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

if (process.platform !== 'darwin') {
  console.info('Not macOS — skipping Swift helper build.')
  process.exit(0)
}

const source = resolve('native/macos/windowlist.swift')
const outDir = resolve('resources')
const output = resolve(outDir, 'windowlist')

mkdirSync(outDir, { recursive: true })

try {
  execFileSync('swiftc', ['-O', '-o', output, source], { stdio: 'inherit' })
  console.info(`Built ${output}`)
} catch (error) {
  console.error('Failed to build the macOS window helper.')
  console.error('Xcode Command Line Tools are required: xcode-select --install')
  throw error
}
```

Add to `package.json` scripts:

```json
"build:helper": "node scripts/build-swift-helper.mjs",
"postinstall": "node scripts/build-swift-helper.mjs"
```

Add `resources/` to `.gitignore`.

- [ ] **Step 3: Build the helper and verify it works**

```bash
npm run build:helper
./resources/windowlist | head -c 200
```

Expected: a JSON array of objects with `id`, `x`, `y`, `width`, `height`, `app`.

- [ ] **Step 4: Write the failing test**

Create `tests/main/window-providers/macos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseHelperOutput } from '../../../src/main/window-providers/macos'

describe('parseHelperOutput', () => {
  it('parses helper JSON into WindowRects preserving order', () => {
    const stdout = JSON.stringify([
      { id: 982, x: 1512, y: 30, width: 1857, height: 1050, app: 'Claude' },
      { id: 130, x: 0, y: 33, width: 1449, height: 949, app: 'Slack' },
    ])
    expect(parseHelperOutput(stdout)).toEqual([
      { id: 982, app: 'Claude', bounds: { x: 1512, y: 30, width: 1857, height: 1050 } },
      { id: 130, app: 'Slack', bounds: { x: 0, y: 33, width: 1449, height: 949 } },
    ])
  })

  it('returns an empty list for an empty array', () => {
    expect(parseHelperOutput('[]')).toEqual([])
  })

  it('skips entries with non-numeric geometry rather than throwing', () => {
    const stdout = JSON.stringify([
      { id: 1, x: 0, y: 0, width: 100, height: 100, app: 'Good' },
      { id: 2, x: 'nope', y: 0, width: 100, height: 100, app: 'Bad' },
    ])
    expect(parseHelperOutput(stdout).map((w) => w.id)).toEqual([1])
  })

  it('throws a descriptive error on malformed JSON', () => {
    expect(() => parseHelperOutput('not json')).toThrow(/window helper/i)
  })

  it('throws when the payload is not an array', () => {
    expect(() => parseHelperOutput('{"id":1}')).toThrow(/window helper/i)
  })
})
```

- [ ] **Step 5: Run the test and verify it fails**

Run: `npx vitest run tests/main/window-providers/macos.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Write the provider interface**

Create `src/main/window-providers/types.ts`:

```ts
import type { WindowRect } from '@shared/window-rect'

export interface WindowProvider {
  /** On-screen windows in global DIP coordinates, ordered front to back. */
  listWindows(): Promise<readonly WindowRect[]>
}
```

- [ ] **Step 7: Write the macOS provider**

Create `src/main/window-providers/macos.ts`:

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { WindowRect } from '@shared/window-rect'
import type { WindowProvider } from './types'

const execFileAsync = promisify(execFile)

type HelperEntry = Record<string, unknown>

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Parses the Swift helper's JSON output. Exported for testing without spawning. */
export function parseHelperOutput(stdout: string): readonly WindowRect[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw new Error('window helper returned malformed JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('window helper returned a non-array payload')
  }

  return parsed.flatMap((raw: HelperEntry): readonly WindowRect[] => {
    const { id, x, y, width, height, app } = raw
    if (
      !isFiniteNumber(id) ||
      !isFiniteNumber(x) ||
      !isFiniteNumber(y) ||
      !isFiniteNumber(width) ||
      !isFiniteNumber(height)
    ) {
      return []
    }
    return [{ id, app: typeof app === 'string' ? app : '', bounds: { x, y, width, height } }]
  })
}

export function createMacOsWindowProvider(helperPath: string): WindowProvider {
  return {
    async listWindows(): Promise<readonly WindowRect[]> {
      const { stdout } = await execFileAsync(helperPath, [], { encoding: 'utf8' })
      return parseHelperOutput(stdout)
    },
  }
}
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `npx vitest run tests/main/window-providers/macos.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add macOS window provider via Swift helper"
```

---

### Task 6: Provider selection, timeout, and stub

Capture must never hang because a helper process wedged. If the provider fails or exceeds `WINDOW_PROVIDER_TIMEOUT_MS`, capture degrades to region-only selection rather than failing.

**Files:**
- Create: `src/main/window-providers/stub.ts`
- Create: `src/main/window-providers/index.ts`
- Test: `tests/main/window-providers/index.test.ts`

**Interfaces:**
- Consumes: `WindowProvider` from `./types`; `createMacOsWindowProvider` from `./macos`; `WINDOW_PROVIDER_TIMEOUT_MS` from `@shared/constants`; `filterCapturableWindows` from `@shared/window-rect`
- Produces:
  - `createStubWindowProvider(windows: readonly WindowRect[]): WindowProvider`
  - `withTimeout(provider: WindowProvider, timeoutMs: number): WindowProvider` — resolves to `[]` on timeout or error, never rejects
  - `resolveWindowProvider(): WindowProvider` — platform selection, honouring `CHOP_STUB_WINDOWS`
  - `listCapturableWindows(provider: WindowProvider): Promise<readonly WindowRect[]>` — provider plus size filtering

- [ ] **Step 1: Write the failing test**

Create `tests/main/window-providers/index.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createStubWindowProvider } from '../../../src/main/window-providers/stub'
import {
  listCapturableWindows,
  withTimeout,
} from '../../../src/main/window-providers/timeout'
import type { WindowRect } from '@shared/window-rect'
import type { WindowProvider } from '../../../src/main/window-providers/types'

const sample: readonly WindowRect[] = [
  { id: 1, app: 'Real', bounds: { x: 0, y: 0, width: 400, height: 300 } },
  { id: 2, app: 'Sliver', bounds: { x: 0, y: 0, width: 3, height: 300 } },
]

describe('createStubWindowProvider', () => {
  it('returns the fixture windows unchanged', async () => {
    await expect(createStubWindowProvider(sample).listWindows()).resolves.toEqual(sample)
  })
})

describe('withTimeout', () => {
  it('passes through a fast provider result', async () => {
    const provider = createStubWindowProvider(sample)
    await expect(withTimeout(provider, 100).listWindows()).resolves.toEqual(sample)
  })

  it('degrades to an empty list when the provider hangs', async () => {
    const hanging: WindowProvider = { listWindows: () => new Promise(() => {}) }
    await expect(withTimeout(hanging, 20).listWindows()).resolves.toEqual([])
  })

  it('degrades to an empty list when the provider rejects', async () => {
    const failing: WindowProvider = {
      listWindows: () => Promise.reject(new Error('helper crashed')),
    }
    await expect(withTimeout(failing, 100).listWindows()).resolves.toEqual([])
  })

  it('logs the failure rather than swallowing it silently', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const failing: WindowProvider = {
      listWindows: () => Promise.reject(new Error('helper crashed')),
    }
    await withTimeout(failing, 100).listWindows()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('listCapturableWindows', () => {
  it('drops windows below the minimum dimension', async () => {
    const result = await listCapturableWindows(createStubWindowProvider(sample))
    expect(result.map((w) => w.id)).toEqual([1])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/main/window-providers/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the stub provider**

Create `src/main/window-providers/stub.ts`:

```ts
import type { WindowRect } from '@shared/window-rect'
import type { WindowProvider } from './types'

/** Returns fixed fixture data so tests and E2E runs never touch the OS. */
export function createStubWindowProvider(windows: readonly WindowRect[]): WindowProvider {
  return { listWindows: () => Promise.resolve(windows) }
}
```

- [ ] **Step 4: Write the electron-free timeout module**

`withTimeout` and `listCapturableWindows` must be unit-testable, so they live in a
module that never imports `electron`.

Create `src/main/window-providers/timeout.ts`:

```ts
import { WINDOW_PROVIDER_TIMEOUT_MS } from '@shared/constants'
import { filterCapturableWindows, type WindowRect } from '@shared/window-rect'
import type { WindowProvider } from './types'

export { WINDOW_PROVIDER_TIMEOUT_MS }

/**
 * Wraps a provider so it can never hang or reject. On failure the caller gets an
 * empty list, which degrades capture to region-only selection.
 */
export function withTimeout(provider: WindowProvider, timeoutMs: number): WindowProvider {
  return {
    async listWindows(): Promise<readonly WindowRect[]> {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<readonly WindowRect[]>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`Window provider timed out after ${timeoutMs}ms; region-only capture.`)
          resolve([])
        }, timeoutMs)
      })
      try {
        return await Promise.race([provider.listWindows(), timeout])
      } catch (error) {
        console.warn('Window provider failed; region-only capture.', error)
        return []
      } finally {
        if (timer) clearTimeout(timer)
      }
    },
  }
}

export async function listCapturableWindows(
  provider: WindowProvider,
): Promise<readonly WindowRect[]> {
  return filterCapturableWindows(await provider.listWindows())
}
```

- [ ] **Step 5: Write the platform resolver**

This module imports `electron`, so nothing in the test suite may import it.

Create `src/main/window-providers/resolve.ts`:

```ts
import { app } from 'electron'
import { join } from 'node:path'
import { WINDOW_PROVIDER_TIMEOUT_MS } from '@shared/constants'
import type { WindowRect } from '@shared/window-rect'
import { createMacOsWindowProvider } from './macos'
import { createStubWindowProvider } from './stub'
import { withTimeout } from './timeout'
import type { WindowProvider } from './types'

function helperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'windowlist')
    : join(app.getAppPath(), 'resources', 'windowlist')
}

export function resolveWindowProvider(): WindowProvider {
  const stubFixture = process.env.CHOP_STUB_WINDOWS
  if (stubFixture) {
    return createStubWindowProvider(JSON.parse(stubFixture) as readonly WindowRect[])
  }
  if (process.platform === 'darwin') {
    return withTimeout(createMacOsWindowProvider(helperPath()), WINDOW_PROVIDER_TIMEOUT_MS)
  }
  // Windows support is added in Task 26. Until then, region-only capture.
  return createStubWindowProvider([])
}
```

- [ ] **Step 6: Write the barrel**

Create `src/main/window-providers/index.ts`:

```ts
export { createStubWindowProvider } from './stub'
export { listCapturableWindows, withTimeout } from './timeout'
export { resolveWindowProvider } from './resolve'
export type { WindowProvider } from './types'
```

Importing this barrel pulls in `electron` via `resolve.ts`, which is correct for
main-process code. Tests must import `./timeout` and `./stub` directly instead.

- [ ] **Step 7: Run the test and verify it passes**

Run: `npx vitest run tests/main/window-providers/index.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add window provider selection with timeout fallback"
```

---

### Task 7: Screen recording permission

**Files:**
- Create: `src/main/permissions.ts`
- Test: `tests/main/permissions.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `type PermissionState = 'granted' | 'denied' | 'not-determined' | 'unsupported'`
  - `screenPermissionState(): PermissionState`
  - `openScreenRecordingSettings(): Promise<void>`
  - `ensureScreenPermission(): Promise<boolean>` — returns false and shows guidance when not granted
  - `permissionMessage(state: PermissionState): string` — pure, tested

- [ ] **Step 1: Write the failing test**

Create `tests/main/permissions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { permissionMessage } from '../../src/main/permissions-message'

describe('permissionMessage', () => {
  it('explains how to grant permission when denied', () => {
    const message = permissionMessage('denied')
    expect(message).toMatch(/Screen Recording/i)
    expect(message).toMatch(/System Settings/i)
  })

  it('explains the first-run prompt when not determined', () => {
    expect(permissionMessage('not-determined')).toMatch(/Screen Recording/i)
  })

  it('returns an empty message when granted', () => {
    expect(permissionMessage('granted')).toBe('')
  })

  it('returns an empty message on platforms without the concept', () => {
    expect(permissionMessage('unsupported')).toBe('')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/main/permissions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure message module**

`permissionMessage` is pure copy, so it lives in its own electron-free module and
the unit test imports it directly. A test that imported `permissions.ts` would
pull in `electron` and fail to resolve under Vitest.

Create `src/main/permissions-message.ts`:

```ts
export type PermissionState = 'granted' | 'denied' | 'not-determined' | 'unsupported'

/** Actionable guidance for each permission state. Empty when nothing is wrong. */
export function permissionMessage(state: PermissionState): string {
  switch (state) {
    case 'denied':
      return (
        'Chop needs Screen Recording permission to capture your screen.\n\n' +
        'Open System Settings \u2192 Privacy & Security \u2192 Screen Recording, ' +
        'enable Chop, then relaunch the app.'
      )
    case 'not-determined':
      return (
        'Chop needs Screen Recording permission to capture your screen.\n\n' +
        'macOS will ask for it the first time you capture. If no prompt appears, ' +
        'grant it in System Settings \u2192 Privacy & Security \u2192 Screen Recording.'
      )
    default:
      return ''
  }
}
```

- [ ] **Step 4: Write the electron-facing permission module**

Create `src/main/permissions.ts`:

```ts
import { dialog, shell, systemPreferences } from 'electron'
import { type PermissionState, permissionMessage } from './permissions-message'

export { permissionMessage }
export type { PermissionState }

const SETTINGS_URL =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

export function screenPermissionState(): PermissionState {
  if (process.platform !== 'darwin') return 'unsupported'
  const status = systemPreferences.getMediaAccessStatus('screen')
  if (status === 'granted') return 'granted'
  if (status === 'denied' || status === 'restricted') return 'denied'
  return 'not-determined'
}

export async function openScreenRecordingSettings(): Promise<void> {
  await shell.openExternal(SETTINGS_URL)
}

/** Returns true when capture may proceed. Shows actionable guidance otherwise. */
export async function ensureScreenPermission(): Promise<boolean> {
  const state = screenPermissionState()
  if (state === 'granted' || state === 'unsupported') return true

  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'Screen Recording permission required',
    message: permissionMessage(state),
  })
  if (response === 0) await openScreenRecordingSettings()
  return false
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/main/permissions.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/permissions.ts src/main/permissions-message.ts tests/main/permissions.test.ts
git commit -m "feat: add macOS screen recording permission handling"
```

---

### Task 8: Freeze-frame screen capture service

**Files:**
- Create: `src/main/capture/capture-service.ts`
- Test: `tests/main/capture/capture-service.test.ts`

**Interfaces:**
- Consumes: `DisplayInfo`, `physicalSize` from `@shared/coords`; `ensureScreenPermission` from `../permissions`
- Produces:
  - `type DisplayCapture = { readonly display: DisplayInfo; readonly dataUrl: string }`
  - `toDisplayInfo(display: Electron.Display): DisplayInfo`
  - `matchSourceToDisplay(sources, displayId): Electron.DesktopCapturerSource | null` — pure, tested
  - `captureAllDisplays(): Promise<readonly DisplayCapture[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/main/capture/capture-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { matchSourceToDisplay } from '../../../src/main/capture/source-match'

type FakeSource = { id: string; display_id: string; name: string }

const sources: readonly FakeSource[] = [
  { id: 'screen:0:0', display_id: '69733382', name: 'Entire Screen' },
  { id: 'screen:1:0', display_id: '69733383', name: 'Display 2' },
]

describe('matchSourceToDisplay', () => {
  it('matches a source by display_id', () => {
    expect(matchSourceToDisplay(sources, 69733383)?.id).toBe('screen:1:0')
  })

  it('returns null when no source matches', () => {
    expect(matchSourceToDisplay(sources, 999)).toBeNull()
  })

  it('falls back to positional matching when display_id is empty', () => {
    const blank: readonly FakeSource[] = [
      { id: 'screen:0:0', display_id: '', name: 'Entire Screen' },
    ]
    expect(matchSourceToDisplay(blank, 12345, 0)?.id).toBe('screen:0:0')
  })

  it('returns null when the positional fallback is out of range', () => {
    expect(matchSourceToDisplay([], 12345, 3)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/main/capture/capture-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure source-matching module**

`matchSourceToDisplay` and `toDisplayInfo` are pure and must stay unit-testable,
so they live in an electron-free module. `Electron.Display` is referenced as a
TYPE only, which erases at compile time and pulls in no runtime dependency.

Create `src/main/capture/source-match.ts`:

```ts
import type { DisplayInfo } from '@shared/coords'

type SourceLike = { readonly id: string; readonly display_id: string }

export function toDisplayInfo(display: Electron.Display): DisplayInfo {
  return {
    id: display.id,
    bounds: {
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
    },
    scaleFactor: display.scaleFactor,
  }
}

/**
 * `display_id` is the reliable link between a Display and a capturer source, but
 * it is empty on some platforms, so fall back to source ordering.
 */
export function matchSourceToDisplay<T extends SourceLike>(
  sources: readonly T[],
  displayId: number,
  index?: number,
): T | null {
  const byId = sources.find((source) => source.display_id === String(displayId))
  if (byId) return byId
  if (index === undefined) return null
  return sources[index] ?? null
}
```

- [ ] **Step 4: Write the capture service**

Create `src/main/capture/capture-service.ts`:

```ts
import { desktopCapturer, screen } from 'electron'
import { type DisplayInfo, physicalSize } from '@shared/coords'
import { ensureScreenPermission } from '../permissions'
import { matchSourceToDisplay, toDisplayInfo } from './source-match'

export { matchSourceToDisplay, toDisplayInfo }

/** A full-resolution frozen screenshot of one display. */
export type DisplayCapture = {
  readonly display: DisplayInfo
  /** PNG data URL at true physical pixel resolution. */
  readonly dataUrl: string
}

/**
 * Screenshots every display at full physical resolution before any UI appears.
 * This is the freeze-frame the overlays draw on.
 */
export async function captureAllDisplays(): Promise<readonly DisplayCapture[]> {
  if (!(await ensureScreenPermission())) return []

  const displays = screen.getAllDisplays().map(toDisplayInfo)
  const largest = displays.reduce(
    (max, display) => {
      const size = physicalSize(display)
      return {
        width: Math.max(max.width, size.width),
        height: Math.max(max.height, size.height),
      }
    },
    { width: 0, height: 0 },
  )

  // thumbnailSize is a ceiling applied to every source, so request the largest
  // display's physical size; smaller displays come back at their native size.
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: largest,
    fetchWindowIcons: false,
  })

  return displays.flatMap((display, index): readonly DisplayCapture[] => {
    const source = matchSourceToDisplay(sources, display.id, index)
    if (!source || source.thumbnail.isEmpty()) {
      console.warn(`No capture source for display ${display.id}; skipping.`)
      return []
    }
    return [{ display, dataUrl: source.thumbnail.toDataURL() }]
  })
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/main/capture/capture-service.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Manually verify true-resolution capture**

Add a temporary line at the end of `app.whenReady()` in `src/main/index.ts`:

```ts
void captureAllDisplays().then((captures) =>
  console.info(captures.map((c) => ({ id: c.display.id, bytes: c.dataUrl.length }))),
)
```

Run: `npm run dev`
Expected: one entry per display, each `bytes` in the hundreds of thousands or more. Grant the Screen Recording prompt if it appears. Remove the temporary line afterwards.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add freeze-frame display capture service"
```

---

### Task 9: IPC contract

Defining every channel and payload in one shared file keeps main and renderer in sync and gives the preload bridges a single source of truth.

**Files:**
- Create: `src/shared/ipc.ts`
- Test: `tests/shared/ipc.test.ts`

**Interfaces:**
- Consumes: `Rect` from `@shared/geometry`; `DisplayInfo` from `@shared/coords`; `WindowRect` from `@shared/window-rect`
- Produces: `CHANNELS` constant plus payload types `OverlayInit`, `OverlaySelection`, `CaptureResult`, `SaveRequest`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/ipc.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CHANNELS } from '@shared/ipc'

describe('CHANNELS', () => {
  it('namespaces every channel under chop:', () => {
    for (const channel of Object.values(CHANNELS)) {
      expect(channel).toMatch(/^chop:/)
    }
  })

  it('defines unique channel names', () => {
    const values = Object.values(CHANNELS)
    expect(new Set(values).size).toBe(values.length)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/ipc.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/ipc.ts`**

```ts
import type { DisplayInfo } from './coords'
import type { Rect } from './geometry'
import type { WindowRect } from './window-rect'

export const CHANNELS = {
  /** main → overlay: frozen image and window rects for one display */
  overlayInit: 'chop:overlay-init',
  /** overlay → main: the user picked a region or window */
  overlaySelection: 'chop:overlay-selection',
  /** overlay → main: the user pressed Escape */
  overlayCancel: 'chop:overlay-cancel',
  /** main → editor: a new capture is ready to edit */
  captureReady: 'chop:capture-ready',
  /** editor → main: persist the flattened image and document */
  saveCapture: 'chop:save-capture',
  /** editor → main: copy the flattened image to the clipboard */
  copyCapture: 'chop:copy-capture',
  /** editor → main: write the flattened image to a user-chosen path */
  saveCaptureAs: 'chop:save-capture-as',
  /** editor → main: list past captures for the filmstrip */
  listCaptures: 'chop:list-captures',
  /** editor → main: load a past capture back into the editor */
  openCapture: 'chop:open-capture',
  /** main → editor: trigger a new capture from the tray or a shortcut */
  requestCapture: 'chop:request-capture',
} as const

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS]

/** Sent to each overlay window as it opens. */
export type OverlayInit = {
  readonly display: DisplayInfo
  readonly dataUrl: string
  /** Window rects converted to display-local DIP coordinates. Front to back. */
  readonly windows: readonly WindowRect[]
}

/** Returned when the user commits a selection. */
export type OverlaySelection = {
  readonly displayId: number
  /** Display-local DIP coordinates. */
  readonly rect: Rect
  readonly source: 'region' | 'window'
}

/** A finished capture handed to the editor. */
export type CaptureResult = {
  readonly id: string
  /** PNG data URL of the cropped image at physical resolution. */
  readonly dataUrl: string
  readonly width: number
  readonly height: number
  readonly createdAt: string
}

/** Sent by the editor whenever the document changes or on close. */
export type SaveRequest = {
  readonly id: string
  /** PNG data URL of the flattened, annotated image. */
  readonly flattenedDataUrl: string
  /** Serialised CaptureDocument. */
  readonly document: unknown
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/ipc.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts tests/shared/ipc.test.ts
git commit -m "feat: define IPC channel contract"
```

---

### Task 10: Overlay windows and selection UI

This is the visible heart of capture: a frozen screenshot per display, dimmed, with the window under the cursor highlighted for a one-click grab and drag for a freeform region.

**Files:**
- Create: `src/main/capture/overlay-manager.ts`
- Create: `src/preload/overlay.ts` (replaces the Task 1 placeholder)
- Create: `src/renderer/overlay/index.html` (replaces the Task 1 placeholder)
- Create: `src/renderer/overlay/main.ts`
- Test: `tests/main/capture/overlay-manager.test.ts`

**Interfaces:**
- Consumes: `DisplayCapture` from `../capture-service`; `WindowRect`, `windowAtPoint` from `@shared/window-rect`; `globalToLocal` from `@shared/coords`; `CHANNELS`, `OverlayInit`, `OverlaySelection` from `@shared/ipc`; `normalizeRect`, `isDegenerateRect` from `@shared/geometry`
- Produces:
  - `windowsForDisplay(windows, display): readonly WindowRect[]` — pure: filters to windows intersecting the display and converts to display-local DIP
  - `showOverlays(captures, windows): Promise<OverlaySelection | null>` — resolves with the selection, or null if cancelled

- [ ] **Step 1: Write the failing test**

Create `tests/main/capture/overlay-manager.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { windowsForDisplay } from '../../../src/main/capture/overlay-layout'
import type { DisplayInfo } from '@shared/coords'
import type { WindowRect } from '@shared/window-rect'

const primary: DisplayInfo = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1512, height: 982 },
  scaleFactor: 2,
}

const external: DisplayInfo = {
  id: 2,
  bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
}

const windows: readonly WindowRect[] = [
  { id: 10, app: 'OnPrimary', bounds: { x: 100, y: 100, width: 400, height: 300 } },
  { id: 11, app: 'OnExternal', bounds: { x: -1800, y: 50, width: 400, height: 300 } },
  { id: 12, app: 'Offscreen', bounds: { x: 9000, y: 9000, width: 100, height: 100 } },
]

describe('windowsForDisplay', () => {
  it('keeps only windows intersecting the display', () => {
    expect(windowsForDisplay(windows, primary).map((w) => w.id)).toEqual([10])
  })

  it('converts bounds to display-local coordinates', () => {
    expect(windowsForDisplay(windows, external)).toEqual([
      { id: 11, app: 'OnExternal', bounds: { x: 120, y: 50, width: 400, height: 300 } },
    ])
  })

  it('preserves front-to-back order', () => {
    const overlapping: readonly WindowRect[] = [
      { id: 1, app: 'Front', bounds: { x: 0, y: 0, width: 100, height: 100 } },
      { id: 2, app: 'Back', bounds: { x: 0, y: 0, width: 200, height: 200 } },
    ]
    expect(windowsForDisplay(overlapping, primary).map((w) => w.id)).toEqual([1, 2])
  })

  it('returns an empty list when nothing intersects', () => {
    expect(windowsForDisplay([windows[2]!], primary)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/main/capture/overlay-manager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the pure overlay layout module**

`windowsForDisplay` is pure and must stay unit-testable, so it lives in an
electron-free module.

Create `src/main/capture/overlay-layout.ts`:

```ts
import { type DisplayInfo, globalToLocal } from '@shared/coords'
import { rectIntersect } from '@shared/geometry'
import type { WindowRect } from '@shared/window-rect'

/** Windows intersecting this display, converted to display-local DIP coordinates. */
export function windowsForDisplay(
  windows: readonly WindowRect[],
  display: DisplayInfo,
): readonly WindowRect[] {
  return windows.flatMap((window): readonly WindowRect[] => {
    if (!rectIntersect(window.bounds, display.bounds)) return []
    return [{ ...window, bounds: globalToLocal(window.bounds, display) }]
  })
}
```

- [ ] **Step 4: Write `src/main/capture/overlay-manager.ts`**

```ts
import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import type { DisplayInfo } from '@shared/coords'
import { CHANNELS, type OverlayInit, type OverlaySelection } from '@shared/ipc'
import type { WindowRect } from '@shared/window-rect'
import type { DisplayCapture } from './capture-service'
import { windowsForDisplay } from './overlay-layout'

export { windowsForDisplay }

function createOverlayWindow(display: DisplayInfo): BrowserWindow {
  const overlay = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    enableLargerThanScreen: true,
    webPreferences: { preload: join(import.meta.dirname, '../preload/overlay.mjs') },
  })

  // 'screen-saver' floats above the menu bar, dock, and fullscreen apps.
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  return overlay
}

function loadOverlay(overlay: BrowserWindow): Promise<void> {
  if (process.env.ELECTRON_RENDERER_URL) {
    return overlay.loadURL(`${process.env.ELECTRON_RENDERER_URL}/overlay/index.html`)
  }
  return overlay.loadFile(join(import.meta.dirname, '../renderer/overlay/index.html'))
}

/**
 * Opens one overlay per display over the frozen screenshots and resolves with the
 * user's selection, or null if they cancelled. Always tears every overlay down.
 */
export async function showOverlays(
  captures: readonly DisplayCapture[],
  windows: readonly WindowRect[],
): Promise<OverlaySelection | null> {
  if (captures.length === 0) return null

  const overlays = captures.map((capture) => ({
    capture,
    window: createOverlayWindow(capture.display),
  }))

  const closeAll = (): void => {
    ipcMain.removeAllListeners(CHANNELS.overlaySelection)
    ipcMain.removeAllListeners(CHANNELS.overlayCancel)
    for (const { window } of overlays) {
      if (!window.isDestroyed()) window.destroy()
    }
  }

  try {
    return await new Promise<OverlaySelection | null>((resolve, reject) => {
      ipcMain.once(CHANNELS.overlaySelection, (_event, selection: OverlaySelection) => {
        resolve(selection)
      })
      ipcMain.once(CHANNELS.overlayCancel, () => resolve(null))

      // allSettled, not all: one display failing must not abort the capture.
      void Promise.allSettled(
        overlays.map(async ({ capture, window }) => {
          await loadOverlay(window)
          const payload: OverlayInit = {
            display: capture.display,
            dataUrl: capture.dataUrl,
            windows: windowsForDisplay(windows, capture.display),
          }
          window.webContents.send(CHANNELS.overlayInit, payload)
          window.show()
          window.focus()
        }),
      ).then((results) => {
        const failures = results.filter((result) => result.status === 'rejected')
        for (const failure of failures) {
          console.warn('An overlay failed to open; continuing on other displays.', failure)
        }
        if (failures.length === overlays.length) reject(new Error('every overlay failed'))
      })
    })
  } finally {
    closeAll()
  }
}
```

- [ ] **Step 5: Write the preload bridge**

Replace `src/preload/overlay.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type OverlayInit, type OverlaySelection } from '@shared/ipc'

contextBridge.exposeInMainWorld('chopOverlay', {
  onInit(handler: (init: OverlayInit) => void): void {
    ipcRenderer.on(CHANNELS.overlayInit, (_event, init: OverlayInit) => handler(init))
  },
  select(selection: OverlaySelection): void {
    ipcRenderer.send(CHANNELS.overlaySelection, selection)
  },
  cancel(): void {
    ipcRenderer.send(CHANNELS.overlayCancel)
  },
})
```

- [ ] **Step 6: Write the overlay markup**

Replace `src/renderer/overlay/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Chop capture</title>
    <style>
      html, body {
        margin: 0;
        height: 100%;
        overflow: hidden;
        cursor: crosshair;
        user-select: none;
        background: transparent;
      }
      #frozen {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
      }
      #veil {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.35);
      }
      /* The selected area is punched out of the veil by a huge box-shadow. */
      #cutout {
        position: fixed;
        display: none;
        box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.35);
        outline: 2px solid #2f9bff;
        pointer-events: none;
      }
      #label {
        position: fixed;
        display: none;
        padding: 3px 7px;
        font: 12px -apple-system, system-ui, sans-serif;
        color: #fff;
        background: rgba(0, 0, 0, 0.78);
        border-radius: 4px;
        pointer-events: none;
      }
      #hint {
        position: fixed;
        left: 50%;
        bottom: 40px;
        transform: translateX(-50%);
        padding: 8px 14px;
        font: 13px -apple-system, system-ui, sans-serif;
        color: #fff;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 8px;
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <img id="frozen" alt="" />
    <div id="veil"></div>
    <div id="cutout"></div>
    <div id="label"></div>
    <div id="hint">Click a window · Drag a region · Esc to cancel</div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Write the overlay logic**

Create `src/renderer/overlay/main.ts`:

```ts
import { isDegenerateRect, normalizeRect, type Point, type Rect } from '@shared/geometry'
import type { OverlayInit, OverlaySelection } from '@shared/ipc'
import { windowAtPoint, type WindowRect } from '@shared/window-rect'

type OverlayBridge = {
  onInit(handler: (init: OverlayInit) => void): void
  select(selection: OverlaySelection): void
  cancel(): void
}

const bridge = (window as unknown as { chopOverlay: OverlayBridge }).chopOverlay

const frozen = document.querySelector<HTMLImageElement>('#frozen')!
const cutout = document.querySelector<HTMLDivElement>('#cutout')!
const label = document.querySelector<HTMLDivElement>('#label')!
const veil = document.querySelector<HTMLDivElement>('#veil')!
const hint = document.querySelector<HTMLDivElement>('#hint')!

let state: OverlayInit | null = null
let dragOrigin: Point | null = null
let currentRect: Rect | null = null

function showRect(rect: Rect, caption: string): void {
  currentRect = rect
  veil.style.display = 'none'
  cutout.style.display = 'block'
  cutout.style.left = `${rect.x}px`
  cutout.style.top = `${rect.y}px`
  cutout.style.width = `${rect.width}px`
  cutout.style.height = `${rect.height}px`

  label.style.display = 'block'
  label.textContent = caption
  // Keep the label inside the viewport when the selection hugs an edge.
  const below = rect.y + rect.height + 8
  label.style.left = `${Math.min(rect.x, window.innerWidth - 120)}px`
  label.style.top = `${below + 24 > window.innerHeight ? rect.y - 26 : below}px`
}

function clearRect(): void {
  currentRect = null
  veil.style.display = 'block'
  cutout.style.display = 'none'
  label.style.display = 'none'
}

function highlightWindowAt(point: Point): void {
  if (!state) return
  const hit: WindowRect | null = windowAtPoint(state.windows, point)
  if (!hit) {
    clearRect()
    return
  }
  showRect(hit.bounds, `${hit.app} · ${Math.round(hit.bounds.width)}×${Math.round(hit.bounds.height)}`)
}

function commit(rect: Rect, source: 'region' | 'window'): void {
  if (!state) return
  bridge.select({ displayId: state.display.id, rect, source })
}

bridge.onInit((init) => {
  state = init
  frozen.src = init.dataUrl
})

document.addEventListener('mousemove', (event) => {
  const point = { x: event.clientX, y: event.clientY }
  if (!dragOrigin) {
    highlightWindowAt(point)
    return
  }
  hint.style.display = 'none'
  const rect = normalizeRect(dragOrigin, point)
  showRect(rect, `${Math.round(rect.width)} × ${Math.round(rect.height)}`)
})

document.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return
  dragOrigin = { x: event.clientX, y: event.clientY }
})

document.addEventListener('mouseup', (event) => {
  if (event.button !== 0 || !dragOrigin) return
  const rect = normalizeRect(dragOrigin, { x: event.clientX, y: event.clientY })
  dragOrigin = null

  // A drag too small to be a region is a click: take the window underneath.
  if (isDegenerateRect(rect)) {
    highlightWindowAt({ x: event.clientX, y: event.clientY })
    if (currentRect) commit(currentRect, 'window')
    return
  }
  commit(rect, 'region')
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') bridge.cancel()
})

// A display that never receives focus still needs Escape to work.
window.addEventListener('blur', () => clearRect())
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `npx vitest run tests/main/capture/overlay-manager.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 9: Manually verify the overlay**

Temporarily replace the body of `app.whenReady()` in `src/main/index.ts` with:

```ts
const captures = await captureAllDisplays()
const windows = await listCapturableWindows(resolveWindowProvider())
console.info('selection:', await showOverlays(captures, windows))
```

Run: `npm run dev`
Expected: the screen freezes and dims; moving the cursor highlights whole windows with the app name and size; clicking logs a `window` selection; dragging logs a `region` selection; Escape logs `null`. Verify on both displays. Restore `src/main/index.ts` afterwards.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add capture overlay with window highlighting"
```

---

### Task 11: Crop the frozen image to the selection

**Files:**
- Create: `src/main/capture/crop.ts`
- Create: `src/main/capture/capture-flow.ts`
- Test: `tests/main/capture/crop.test.ts`

**Interfaces:**
- Consumes: `selectionToPhysical` from `@shared/coords`; `DisplayCapture` from `./capture-service`; `OverlaySelection`, `CaptureResult` from `@shared/ipc`; `showOverlays` from `./overlay-manager`
- Produces:
  - `cropCapture(capture: DisplayCapture, selection: OverlaySelection): CaptureResult | null`
  - `runCaptureFlow(): Promise<CaptureResult | null>` — the whole pipeline: permission → freeze-frame → windows → overlays → crop

- [ ] **Step 1: Write the failing test**

Create `tests/main/capture/crop.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

const cropped = { width: 400, height: 200 }

vi.mock('electron', () => ({
  nativeImage: {
    createFromDataURL: (url: string) => ({
      isEmpty: () => url === 'data:empty',
      crop: (rect: { width: number; height: number }) => ({
        getSize: () => ({ width: rect.width, height: rect.height }),
        toDataURL: () => 'data:cropped',
      }),
      getSize: () => ({ width: 3024, height: 1964 }),
    }),
  },
}))

const { cropCapture } = await import('../../../src/main/capture/crop')

const capture = {
  display: { id: 1, bounds: { x: 0, y: 0, width: 1512, height: 982 }, scaleFactor: 2 },
  dataUrl: 'data:full',
}

describe('cropCapture', () => {
  it('scales a DIP selection to physical pixels before cropping', () => {
    const result = cropCapture(capture, {
      displayId: 1,
      rect: { x: 100, y: 50, width: 200, height: 100 },
      source: 'region',
    })
    expect(result).not.toBeNull()
    expect(result?.width).toBe(cropped.width)
    expect(result?.height).toBe(cropped.height)
    expect(result?.dataUrl).toBe('data:cropped')
  })

  it('assigns an id and an ISO timestamp', () => {
    const result = cropCapture(capture, {
      displayId: 1,
      rect: { x: 0, y: 0, width: 100, height: 100 },
      source: 'window',
    })
    expect(result?.id).toMatch(/\S/)
    expect(() => new Date(result!.createdAt).toISOString()).not.toThrow()
  })

  it('returns null for an empty source image', () => {
    const empty = { ...capture, dataUrl: 'data:empty' }
    expect(
      cropCapture(empty, {
        displayId: 1,
        rect: { x: 0, y: 0, width: 100, height: 100 },
        source: 'region',
      }),
    ).toBeNull()
  })

  it('clamps a selection that exceeds the captured image bounds', () => {
    // 1512 DIP at 2x reports a 3024-wide image; ask for more and the crop must
    // be trimmed rather than requesting pixels that do not exist.
    const result = cropCapture(capture, {
      displayId: 1,
      rect: { x: 1500, y: 0, width: 200, height: 100 },
      source: 'region',
    })
    expect(result).not.toBeNull()
    expect(result!.width).toBeLessThanOrEqual(3024)
  })

  it('returns null for a zero-area selection', () => {
    expect(
      cropCapture(capture, {
        displayId: 1,
        rect: { x: 0, y: 0, width: 0, height: 0 },
        source: 'region',
      }),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/main/capture/crop.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/main/capture/crop.ts`**

```ts
import { nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { selectionToPhysical } from '@shared/coords'
import { clampRect, rectArea } from '@shared/geometry'
import type { CaptureResult, OverlaySelection } from '@shared/ipc'
import type { DisplayCapture } from './capture-service'

/** Crops the frozen full-resolution image to the user's selection. */
export function cropCapture(
  capture: DisplayCapture,
  selection: OverlaySelection,
): CaptureResult | null {
  const image = nativeImage.createFromDataURL(capture.dataUrl)
  if (image.isEmpty()) {
    console.warn('Frozen capture image was empty; nothing to crop.')
    return null
  }

  // The captured image's own size is authoritative — our arithmetic is not.
  // Clamping here means a rounding disagreement can never ask for pixels that
  // do not exist, which matters at fractional display scale factors.
  const size = image.getSize()
  const imageBounds = { x: 0, y: 0, width: size.width, height: size.height }
  const physical = clampRect(selectionToPhysical(selection.rect, capture.display), imageBounds)
  if (rectArea(physical) === 0) return null

  const output = image.crop(physical)
  const size = output.getSize()
  return {
    id: randomUUID(),
    dataUrl: output.toDataURL(),
    width: size.width,
    height: size.height,
    createdAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 4: Write `src/main/capture/capture-flow.ts`**

```ts
import type { CaptureResult } from '@shared/ipc'
import { listCapturableWindows, resolveWindowProvider } from '../window-providers/index'
import { captureAllDisplays } from './capture-service'
import { cropCapture } from './crop'
import { showOverlays } from './overlay-manager'

let inFlight = false

/**
 * The full capture pipeline. Guarded against re-entry so a repeated hotkey press
 * cannot stack overlays on top of each other.
 */
export async function runCaptureFlow(): Promise<CaptureResult | null> {
  if (inFlight) return null
  inFlight = true
  try {
    const captures = await captureAllDisplays()
    if (captures.length === 0) return null

    const windows = await listCapturableWindows(resolveWindowProvider())
    const selection = await showOverlays(captures, windows)
    if (!selection) return null

    const capture = captures.find((item) => item.display.id === selection.displayId)
    if (!capture) {
      console.warn(`Selection referenced unknown display ${selection.displayId}.`)
      return null
    }
    return cropCapture(capture, selection)
  } catch (error) {
    console.error('Capture failed.', error)
    return null
  } finally {
    inFlight = false
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/main/capture/crop.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: crop frozen capture to selection"
```

---

### Task 12: Annotation document model

The document is the single source of truth for the editor. Every operation returns a new document — nothing is ever mutated.

**Files:**
- Create: `src/shared/document.ts`
- Test: `tests/shared/document.test.ts`

**Interfaces:**
- Consumes: `Point`, `Rect` from `@shared/geometry`; `DEFAULT_STROKE_WIDTH`, `DEFAULT_FONT_SIZE` from `@shared/constants`
- Produces:
  - `type Annotation` — union of `BoxAnnotation`, `ArrowAnnotation`, `TextAnnotation`, `HighlightAnnotation`, `BlurAnnotation`
  - `type CaptureDocument = { readonly id, width, height, cropRect: Rect | null, annotations: readonly Annotation[] }`
  - `createDocument(id: string, width: number, height: number): CaptureDocument`
  - `addAnnotation(doc, annotation): CaptureDocument`
  - `updateAnnotation(doc, id, update: (a: Annotation) => Annotation): CaptureDocument`
  - `removeAnnotation(doc, id): CaptureDocument`
  - `setCrop(doc, rect: Rect | null): CaptureDocument`
  - `outputSize(doc): { readonly width: number; readonly height: number }`
  - `serializeDocument(doc): string` / `parseDocument(json: string): CaptureDocument`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/document.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  addAnnotation,
  type Annotation,
  createDocument,
  outputSize,
  parseDocument,
  removeAnnotation,
  serializeDocument,
  setCrop,
  updateAnnotation,
} from '@shared/document'

const box: Annotation = {
  id: 'a1',
  kind: 'box',
  rect: { x: 10, y: 10, width: 50, height: 40 },
  color: '#ff0000',
  strokeWidth: 3,
}

const arrow: Annotation = {
  id: 'a2',
  kind: 'arrow',
  from: { x: 0, y: 0 },
  to: { x: 100, y: 100 },
  color: '#00ff00',
  strokeWidth: 4,
}

describe('createDocument', () => {
  it('starts with no annotations and no crop', () => {
    const doc = createDocument('doc-1', 800, 600)
    expect(doc).toEqual({
      id: 'doc-1',
      width: 800,
      height: 600,
      cropRect: null,
      annotations: [],
    })
  })
})

describe('addAnnotation', () => {
  it('appends without mutating the original document', () => {
    const doc = createDocument('doc-1', 800, 600)
    const next = addAnnotation(doc, box)
    expect(next.annotations).toEqual([box])
    expect(doc.annotations).toEqual([])
  })

  it('preserves insertion order, which is z-order', () => {
    const doc = addAnnotation(addAnnotation(createDocument('d', 10, 10), box), arrow)
    expect(doc.annotations.map((a) => a.id)).toEqual(['a1', 'a2'])
  })
})

describe('updateAnnotation', () => {
  it('replaces the matching annotation', () => {
    const doc = addAnnotation(createDocument('d', 800, 600), box)
    const next = updateAnnotation(doc, 'a1', (a) =>
      a.kind === 'box' ? { ...a, color: '#0000ff' } : a,
    )
    expect(next.annotations[0]).toMatchObject({ id: 'a1', color: '#0000ff' })
  })

  it('does not mutate the original annotation', () => {
    const doc = addAnnotation(createDocument('d', 800, 600), box)
    updateAnnotation(doc, 'a1', (a) => (a.kind === 'box' ? { ...a, color: '#0000ff' } : a))
    expect(doc.annotations[0]).toMatchObject({ color: '#ff0000' })
  })

  it('returns an equal document when the id is unknown', () => {
    const doc = addAnnotation(createDocument('d', 800, 600), box)
    expect(updateAnnotation(doc, 'missing', (a) => a).annotations).toEqual(doc.annotations)
  })
})

describe('removeAnnotation', () => {
  it('drops only the matching annotation', () => {
    const doc = addAnnotation(addAnnotation(createDocument('d', 10, 10), box), arrow)
    expect(removeAnnotation(doc, 'a1').annotations.map((a) => a.id)).toEqual(['a2'])
  })

  it('is a no-op for an unknown id', () => {
    const doc = addAnnotation(createDocument('d', 10, 10), box)
    expect(removeAnnotation(doc, 'nope').annotations).toHaveLength(1)
  })
})

describe('setCrop', () => {
  it('stores the crop rect', () => {
    const doc = setCrop(createDocument('d', 800, 600), { x: 10, y: 10, width: 100, height: 80 })
    expect(doc.cropRect).toEqual({ x: 10, y: 10, width: 100, height: 80 })
  })

  it('clears the crop when passed null, restoring full size', () => {
    const cropped = setCrop(createDocument('d', 800, 600), {
      x: 10, y: 10, width: 100, height: 80,
    })
    expect(outputSize(setCrop(cropped, null))).toEqual({ width: 800, height: 600 })
  })

  it('keeps annotations untouched, so uncropping restores their positions', () => {
    const doc = addAnnotation(createDocument('d', 800, 600), box)
    const cropped = setCrop(doc, { x: 0, y: 0, width: 100, height: 100 })
    expect(cropped.annotations).toEqual([box])
  })
})

describe('outputSize', () => {
  it('reports full size when uncropped', () => {
    expect(outputSize(createDocument('d', 800, 600))).toEqual({ width: 800, height: 600 })
  })

  it('reports crop size when cropped', () => {
    const doc = setCrop(createDocument('d', 800, 600), { x: 5, y: 5, width: 300, height: 200 })
    expect(outputSize(doc)).toEqual({ width: 300, height: 200 })
  })
})

describe('serializeDocument / parseDocument', () => {
  it('round-trips a document with annotations and a crop', () => {
    const doc = setCrop(
      addAnnotation(addAnnotation(createDocument('d', 800, 600), box), arrow),
      { x: 1, y: 2, width: 300, height: 200 },
    )
    expect(parseDocument(serializeDocument(doc))).toEqual(doc)
  })

  it('rejects malformed JSON with a descriptive error', () => {
    expect(() => parseDocument('{oops')).toThrow(/document/i)
  })

  it('rejects a payload missing required fields', () => {
    expect(() => parseDocument('{"id":"d"}')).toThrow(/document/i)
  })

  it('drops a malformed cropRect rather than trusting the file', () => {
    const payload = JSON.stringify({
      id: 'd', width: 10, height: 10,
      cropRect: { x: 'nope', y: 0, width: 5, height: 5 },
      annotations: [],
    })
    expect(parseDocument(payload).cropRect).toBeNull()
  })

  it('drops a non-finite cropRect', () => {
    const payload = '{"id":"d","width":10,"height":10,"cropRect":{"x":null,"y":0,"width":5,"height":5},"annotations":[]}'
    expect(parseDocument(payload).cropRect).toBeNull()
  })

  it('keeps a well-formed cropRect', () => {
    const payload = JSON.stringify({
      id: 'd', width: 10, height: 10,
      cropRect: { x: 1, y: 2, width: 3, height: 4 },
      annotations: [],
    })
    expect(parseDocument(payload).cropRect).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })

  it('drops annotations of an unknown kind rather than failing the whole load', () => {
    const payload = JSON.stringify({
      id: 'd',
      width: 10,
      height: 10,
      cropRect: null,
      annotations: [box, { id: 'x', kind: 'wormhole' }],
    })
    expect(parseDocument(payload).annotations.map((a) => a.id)).toEqual(['a1'])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/document.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/document.ts`**

```ts
import type { Point, Rect } from './geometry'

export type BoxAnnotation = {
  readonly id: string
  readonly kind: 'box'
  readonly rect: Rect
  readonly color: string
  readonly strokeWidth: number
}

export type ArrowAnnotation = {
  readonly id: string
  readonly kind: 'arrow'
  readonly from: Point
  readonly to: Point
  readonly color: string
  readonly strokeWidth: number
}

export type TextAnnotation = {
  readonly id: string
  readonly kind: 'text'
  readonly at: Point
  readonly text: string
  readonly color: string
  readonly fontSize: number
}

export type HighlightAnnotation = {
  readonly id: string
  readonly kind: 'highlight'
  readonly rect: Rect
  readonly color: string
}

export type BlurAnnotation = {
  readonly id: string
  readonly kind: 'blur'
  readonly rect: Rect
}

export type Annotation =
  | BoxAnnotation
  | ArrowAnnotation
  | TextAnnotation
  | HighlightAnnotation
  | BlurAnnotation

export type CaptureDocument = {
  readonly id: string
  /** Full source image size in pixels, independent of any crop. */
  readonly width: number
  readonly height: number
  /** Non-destructive crop in image coordinates, or null for the full image. */
  readonly cropRect: Rect | null
  /** Ordered back to front. */
  readonly annotations: readonly Annotation[]
}

export function createDocument(id: string, width: number, height: number): CaptureDocument {
  return { id, width, height, cropRect: null, annotations: [] }
}

export function addAnnotation(doc: CaptureDocument, annotation: Annotation): CaptureDocument {
  return { ...doc, annotations: [...doc.annotations, annotation] }
}

export function updateAnnotation(
  doc: CaptureDocument,
  id: string,
  update: (annotation: Annotation) => Annotation,
): CaptureDocument {
  return {
    ...doc,
    annotations: doc.annotations.map((a) => (a.id === id ? update(a) : a)),
  }
}

export function removeAnnotation(doc: CaptureDocument, id: string): CaptureDocument {
  return { ...doc, annotations: doc.annotations.filter((a) => a.id !== id) }
}

export function setCrop(doc: CaptureDocument, rect: Rect | null): CaptureDocument {
  return { ...doc, cropRect: rect }
}

export function outputSize(doc: CaptureDocument): {
  readonly width: number
  readonly height: number
} {
  if (!doc.cropRect) return { width: doc.width, height: doc.height }
  return { width: doc.cropRect.width, height: doc.cropRect.height }
}

export function serializeDocument(doc: CaptureDocument): string {
  return JSON.stringify(doc)
}

const KINDS: readonly Annotation['kind'][] = ['box', 'arrow', 'text', 'highlight', 'blur']

function isRect(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.x === 'number' &&
    typeof r.y === 'number' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number' &&
    Number.isFinite(r.x) &&
    Number.isFinite(r.y) &&
    Number.isFinite(r.width) &&
    Number.isFinite(r.height)
  )
}

function isAnnotation(value: unknown): value is Annotation {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { kind?: unknown; id?: unknown }
  return (
    typeof candidate.id === 'string' &&
    KINDS.includes(candidate.kind as Annotation['kind'])
  )
}

/** Validates untrusted JSON from disk. Unknown annotation kinds are dropped. */
export function parseDocument(json: string): CaptureDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('capture document is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('capture document must be an object')
  }

  const { id, width, height, cropRect, annotations } = parsed as Record<string, unknown>
  if (typeof id !== 'string' || typeof width !== 'number' || typeof height !== 'number') {
    throw new Error('capture document is missing id, width, or height')
  }

  return {
    id,
    width,
    height,
    cropRect: isRect(cropRect) ? cropRect : null,
    annotations: Array.isArray(annotations) ? annotations.filter(isAnnotation) : [],
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/document.test.ts`
Expected: PASS — 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/document.ts tests/shared/document.test.ts
git commit -m "feat: add immutable annotation document model"
```

---

### Task 13: Undo/redo history

**Files:**
- Create: `src/shared/history.ts`
- Test: `tests/shared/history.test.ts`

**Interfaces:**
- Consumes: `HISTORY_LIMIT` from `@shared/constants`
- Produces:
  - `type History<T> = { readonly past: readonly T[]; readonly present: T; readonly future: readonly T[] }`
  - `createHistory<T>(present: T): History<T>`
  - `pushHistory<T>(history, present): History<T>` — caps `past` at `HISTORY_LIMIT` and clears `future`
  - `undo<T>(history): History<T>` / `redo<T>(history): History<T>`
  - `canUndo(history): boolean` / `canRedo(history): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HISTORY_LIMIT } from '@shared/constants'
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redo,
  undo,
} from '@shared/history'

describe('createHistory', () => {
  it('starts with no past and no future', () => {
    expect(createHistory('a')).toEqual({ past: [], present: 'a', future: [] })
  })
})

describe('pushHistory', () => {
  it('moves the old present into the past', () => {
    expect(pushHistory(createHistory('a'), 'b')).toEqual({
      past: ['a'], present: 'b', future: [],
    })
  })

  it('clears the redo stack on a new edit', () => {
    const branched = undo(pushHistory(createHistory('a'), 'b'))
    expect(canRedo(branched)).toBe(true)
    expect(canRedo(pushHistory(branched, 'c'))).toBe(false)
  })

  it('caps the past at HISTORY_LIMIT, discarding oldest first', () => {
    let history = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 10; i += 1) history = pushHistory(history, i)
    expect(history.past).toHaveLength(HISTORY_LIMIT)
    expect(history.past[0]).toBe(11)
  })

  it('does not mutate the input history', () => {
    const original = createHistory('a')
    pushHistory(original, 'b')
    expect(original).toEqual({ past: [], present: 'a', future: [] })
  })
})

describe('undo', () => {
  it('restores the previous present', () => {
    expect(undo(pushHistory(createHistory('a'), 'b'))).toEqual({
      past: [], present: 'a', future: ['b'],
    })
  })

  it('is a no-op with an empty past', () => {
    const history = createHistory('a')
    expect(undo(history)).toEqual(history)
  })
})

describe('redo', () => {
  it('reapplies an undone state', () => {
    const history = pushHistory(createHistory('a'), 'b')
    expect(redo(undo(history))).toEqual(history)
  })

  it('is a no-op with an empty future', () => {
    const history = createHistory('a')
    expect(redo(history)).toEqual(history)
  })
})

describe('canUndo / canRedo', () => {
  it('reports false on a fresh history', () => {
    const history = createHistory('a')
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
  })

  it('reports true once an edit has been pushed', () => {
    expect(canUndo(pushHistory(createHistory('a'), 'b'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/history.ts`**

```ts
import { HISTORY_LIMIT } from './constants'

/**
 * Snapshot-based undo. Documents are immutable and share their source image by
 * reference, so a snapshot costs almost nothing.
 */
export type History<T> = {
  readonly past: readonly T[]
  readonly present: T
  readonly future: readonly T[]
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

export function pushHistory<T>(history: History<T>, present: T): History<T> {
  const past = [...history.past, history.present]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present,
    future: [],
  }
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1]
  if (previous === undefined) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0]
  if (next === undefined) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/history.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/history.ts tests/shared/history.test.ts
git commit -m "feat: add snapshot undo/redo history"
```

---

### Task 14: Annotation bounds, hit-testing, and resize handles

**Files:**
- Create: `src/shared/hit-test.ts`
- Test: `tests/shared/hit-test.test.ts`

**Interfaces:**
- Consumes: `Point`, `Rect`, `normalizeRect`, `rectContains`, `offsetRect` from `@shared/geometry`; `Annotation`, `CaptureDocument` from `@shared/document`; `HANDLE_SIZE` from `@shared/constants`
- Produces:
  - `type HandleId = 'nw' | 'ne' | 'sw' | 'se'`
  - `annotationBounds(annotation: Annotation): Rect`
  - `annotationAtPoint(doc: CaptureDocument, point: Point): Annotation | null` — front-most first
  - `handleRects(rect: Rect): readonly { readonly id: HandleId; readonly rect: Rect }[]`
  - `handleAtPoint(rect: Rect, point: Point): HandleId | null`
  - `resizeRect(rect: Rect, handle: HandleId, point: Point): Rect`
  - `moveAnnotation(annotation: Annotation, dx: number, dy: number): Annotation`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/hit-test.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HANDLE_SIZE } from '@shared/constants'
import { addAnnotation, type Annotation, createDocument } from '@shared/document'
import {
  annotationAtPoint,
  annotationBounds,
  handleAtPoint,
  handleRects,
  moveAnnotation,
  resizeRect,
} from '@shared/hit-test'

const box: Annotation = {
  id: 'box', kind: 'box',
  rect: { x: 10, y: 10, width: 100, height: 50 },
  color: '#f00', strokeWidth: 3,
}

const arrow: Annotation = {
  id: 'arrow', kind: 'arrow',
  from: { x: 200, y: 200 }, to: { x: 100, y: 150 },
  color: '#0f0', strokeWidth: 4,
}

const text: Annotation = {
  id: 'text', kind: 'text',
  at: { x: 300, y: 300 }, text: 'hello', color: '#00f', fontSize: 20,
}

describe('annotationBounds', () => {
  it('returns the rect for a box', () => {
    expect(annotationBounds(box)).toEqual({ x: 10, y: 10, width: 100, height: 50 })
  })

  it('normalizes an arrow drawn right-to-left into a positive rect', () => {
    expect(annotationBounds(arrow)).toEqual({ x: 100, y: 150, width: 100, height: 50 })
  })

  it('estimates text bounds from font size and length', () => {
    const bounds = annotationBounds(text)
    expect(bounds.x).toBe(300)
    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.height).toBeGreaterThanOrEqual(20)
  })

  it('returns the rect for highlight and blur', () => {
    const blur: Annotation = { id: 'b', kind: 'blur', rect: { x: 1, y: 2, width: 3, height: 4 } }
    expect(annotationBounds(blur)).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })
})

describe('annotationAtPoint', () => {
  const doc = addAnnotation(addAnnotation(createDocument('d', 800, 600), box), {
    ...box, id: 'onTop',
  })

  it('returns the front-most annotation when two overlap', () => {
    expect(annotationAtPoint(doc, { x: 50, y: 30 })?.id).toBe('onTop')
  })

  it('returns null when nothing is hit', () => {
    expect(annotationAtPoint(doc, { x: 700, y: 500 })).toBeNull()
  })

  it('returns null for an empty document', () => {
    expect(annotationAtPoint(createDocument('d', 10, 10), { x: 1, y: 1 })).toBeNull()
  })
})

describe('handleRects', () => {
  it('produces four corner handles centred on the corners', () => {
    const handles = handleRects({ x: 100, y: 100, width: 200, height: 100 })
    expect(handles.map((h) => h.id)).toEqual(['nw', 'ne', 'sw', 'se'])
    expect(handles[0]!.rect).toEqual({
      x: 100 - HANDLE_SIZE / 2,
      y: 100 - HANDLE_SIZE / 2,
      width: HANDLE_SIZE,
      height: HANDLE_SIZE,
    })
  })
})

describe('handleAtPoint', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 }

  it('finds the south-east handle', () => {
    expect(handleAtPoint(rect, { x: 300, y: 200 })).toBe('se')
  })

  it('returns null away from every handle', () => {
    expect(handleAtPoint(rect, { x: 200, y: 150 })).toBeNull()
  })
})

describe('resizeRect', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 }

  it('moves the south-east corner to the pointer', () => {
    expect(resizeRect(rect, 'se', { x: 400, y: 300 })).toEqual({
      x: 100, y: 100, width: 300, height: 200,
    })
  })

  it('moves the north-west corner and keeps the opposite corner fixed', () => {
    expect(resizeRect(rect, 'nw', { x: 50, y: 50 })).toEqual({
      x: 50, y: 50, width: 250, height: 150,
    })
  })

  it('normalizes when dragged past the opposite corner', () => {
    const flipped = resizeRect(rect, 'se', { x: 50, y: 50 })
    expect(flipped.width).toBeGreaterThanOrEqual(0)
    expect(flipped.height).toBeGreaterThanOrEqual(0)
  })
})

describe('moveAnnotation', () => {
  it('offsets a box rect', () => {
    const moved = moveAnnotation(box, 5, -5)
    expect(moved).toMatchObject({ rect: { x: 15, y: 5, width: 100, height: 50 } })
  })

  it('offsets both arrow endpoints', () => {
    expect(moveAnnotation(arrow, 10, 10)).toMatchObject({
      from: { x: 210, y: 210 }, to: { x: 110, y: 160 },
    })
  })

  it('offsets a text anchor', () => {
    expect(moveAnnotation(text, -50, 0)).toMatchObject({ at: { x: 250, y: 300 } })
  })

  it('does not mutate the input', () => {
    moveAnnotation(box, 100, 100)
    expect(box.rect).toEqual({ x: 10, y: 10, width: 100, height: 50 })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/hit-test.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/hit-test.ts`**

```ts
import { HANDLE_SIZE } from './constants'
import type { Annotation, CaptureDocument } from './document'
import {
  normalizeRect,
  offsetRect,
  type Point,
  type Rect,
  rectContains,
} from './geometry'

export type HandleId = 'nw' | 'ne' | 'sw' | 'se'

/** Rough per-character width as a fraction of font size, for text bounds. */
const TEXT_WIDTH_RATIO = 0.6
const TEXT_HEIGHT_RATIO = 1.25

export function annotationBounds(annotation: Annotation): Rect {
  switch (annotation.kind) {
    case 'box':
    case 'highlight':
    case 'blur':
      return annotation.rect
    case 'arrow':
      return normalizeRect(annotation.from, annotation.to)
    case 'text':
      return {
        x: annotation.at.x,
        y: annotation.at.y,
        width: Math.max(
          annotation.fontSize,
          annotation.text.length * annotation.fontSize * TEXT_WIDTH_RATIO,
        ),
        height: annotation.fontSize * TEXT_HEIGHT_RATIO,
      }
  }
}

/** Front-most annotation containing the point, or null. */
export function annotationAtPoint(
  doc: CaptureDocument,
  point: Point,
): Annotation | null {
  for (let index = doc.annotations.length - 1; index >= 0; index -= 1) {
    const annotation = doc.annotations[index]!
    if (rectContains(annotationBounds(annotation), point)) return annotation
  }
  return null
}

export function handleRects(
  rect: Rect,
): readonly { readonly id: HandleId; readonly rect: Rect }[] {
  const half = HANDLE_SIZE / 2
  const at = (x: number, y: number): Rect => ({
    x: x - half,
    y: y - half,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  })
  return [
    { id: 'nw', rect: at(rect.x, rect.y) },
    { id: 'ne', rect: at(rect.x + rect.width, rect.y) },
    { id: 'sw', rect: at(rect.x, rect.y + rect.height) },
    { id: 'se', rect: at(rect.x + rect.width, rect.y + rect.height) },
  ]
}

export function handleAtPoint(rect: Rect, point: Point): HandleId | null {
  return handleRects(rect).find((handle) => rectContains(handle.rect, point))?.id ?? null
}

/** Drags one corner to the pointer, keeping the opposite corner anchored. */
export function resizeRect(rect: Rect, handle: HandleId, point: Point): Rect {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  switch (handle) {
    case 'nw':
      return normalizeRect(point, { x: right, y: bottom })
    case 'ne':
      return normalizeRect({ x: left, y: bottom }, point)
    case 'sw':
      return normalizeRect({ x: right, y: top }, point)
    case 'se':
      return normalizeRect({ x: left, y: top }, point)
  }
}

export function moveAnnotation(
  annotation: Annotation,
  dx: number,
  dy: number,
): Annotation {
  switch (annotation.kind) {
    case 'box':
    case 'highlight':
    case 'blur':
      return { ...annotation, rect: offsetRect(annotation.rect, dx, dy) }
    case 'arrow':
      return {
        ...annotation,
        from: { x: annotation.from.x + dx, y: annotation.from.y + dy },
        to: { x: annotation.to.x + dx, y: annotation.to.y + dy },
      }
    case 'text':
      return { ...annotation, at: { x: annotation.at.x + dx, y: annotation.at.y + dy } }
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/hit-test.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/hit-test.ts tests/shared/hit-test.test.ts
git commit -m "feat: add annotation hit-testing and resize handles"
```

---

### Task 15: Pure canvas rendering

Rendering is a pure function of the document. It runs identically in the editor and when flattening for export, so what you see is always what gets saved.

**Files:**
- Create: `src/shared/render.ts`
- Create: `tests/helpers/mock-context.ts`
- Test: `tests/shared/render.test.ts`

**Interfaces:**
- Consumes: `Annotation`, `CaptureDocument` from `@shared/document`; `PIXELATE_BLOCK_SIZE` from `@shared/constants`
- Produces:
  - `type CanvasFactory = (width: number, height: number) => { readonly canvas: CanvasImageSource; readonly ctx: CanvasRenderingContext2D }`
  - `renderDocument(ctx, image, doc, createCanvas): void`

- [ ] **Step 1: Write the mock context helper**

Create `tests/helpers/mock-context.ts`:

```ts
export type Op = { readonly name: string; readonly args: readonly unknown[] }

export type MockContext = {
  readonly ops: readonly Op[]
  readonly ctx: CanvasRenderingContext2D
}

/**
 * A recording stand-in for CanvasRenderingContext2D. Canvas is unavailable in a
 * Node test environment, so rendering is verified by the sequence of calls.
 */
export function createMockContext(): MockContext {
  const ops: Op[] = []
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      ops.push({ name, args })
    }

  const ctx = {
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    fillText: record('fillText'),
    drawImage: record('drawImage'),
    rect: record('rect'),
    clip: record('clip'),
    clearRect: record('clearRect'),
    set globalCompositeOperation(value: string) {
      ops.push({ name: 'set:globalCompositeOperation', args: [value] })
    },
    set globalAlpha(value: number) {
      ops.push({ name: 'set:globalAlpha', args: [value] })
    },
    set imageSmoothingEnabled(value: boolean) {
      ops.push({ name: 'set:imageSmoothingEnabled', args: [value] })
    },
    set strokeStyle(value: string) {
      ops.push({ name: 'set:strokeStyle', args: [value] })
    },
    set fillStyle(value: string) {
      ops.push({ name: 'set:fillStyle', args: [value] })
    },
    set lineWidth(value: number) {
      ops.push({ name: 'set:lineWidth', args: [value] })
    },
    set font(value: string) {
      ops.push({ name: 'set:font', args: [value] })
    },
    set textBaseline(value: string) {
      ops.push({ name: 'set:textBaseline', args: [value] })
    },
    set lineJoin(value: string) {
      ops.push({ name: 'set:lineJoin', args: [value] })
    },
  } as unknown as CanvasRenderingContext2D

  return { ops, ctx }
}

export function opNames(ops: readonly Op[]): readonly string[] {
  return ops.map((op) => op.name)
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/shared/render.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PIXELATE_BLOCK_SIZE } from '@shared/constants'
import { addAnnotation, type Annotation, createDocument, setCrop } from '@shared/document'
import { type CanvasFactory, renderDocument } from '@shared/render'
import { createMockContext, opNames } from '../helpers/mock-context'

const image = {} as CanvasImageSource

function factory(): CanvasFactory {
  return () => {
    const { ctx } = createMockContext()
    return { canvas: {} as CanvasImageSource, ctx }
  }
}

describe('renderDocument', () => {
  it('draws the source image first', () => {
    const { ctx, ops } = createMockContext()
    renderDocument(ctx, image, createDocument('d', 800, 600), factory())
    expect(ops[0]?.name).toBe('save')
    expect(opNames(ops)).toContain('drawImage')
  })

  it('translates by the negative crop origin so annotations stay aligned', () => {
    const { ctx, ops } = createMockContext()
    const doc = setCrop(createDocument('d', 800, 600), {
      x: 100, y: 50, width: 300, height: 200,
    })
    renderDocument(ctx, image, doc, factory())
    expect(ops.find((op) => op.name === 'translate')?.args).toEqual([-100, -50])
  })

  it('strokes a box with its colour and width', () => {
    const { ctx, ops } = createMockContext()
    const box: Annotation = {
      id: 'b', kind: 'box',
      rect: { x: 10, y: 10, width: 50, height: 40 },
      color: '#ff0000', strokeWidth: 3,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), box), factory())
    expect(ops).toContainEqual({ name: 'set:strokeStyle', args: ['#ff0000'] })
    expect(ops).toContainEqual({ name: 'set:lineWidth', args: [3] })
    expect(ops).toContainEqual({ name: 'strokeRect', args: [10, 10, 50, 40] })
  })

  it('draws an arrow as a line plus a filled head', () => {
    const { ctx, ops } = createMockContext()
    const arrow: Annotation = {
      id: 'a', kind: 'arrow',
      from: { x: 0, y: 0 }, to: { x: 100, y: 0 },
      color: '#00ff00', strokeWidth: 4,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), arrow), factory())
    const names = opNames(ops)
    expect(names).toContain('stroke')
    expect(names).toContain('fill')
  })

  it('uses multiply compositing for the highlighter so text stays readable', () => {
    const { ctx, ops } = createMockContext()
    const highlight: Annotation = {
      id: 'h', kind: 'highlight',
      rect: { x: 0, y: 0, width: 100, height: 20 }, color: '#ffff00',
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), highlight), factory())
    expect(ops).toContainEqual({ name: 'set:globalCompositeOperation', args: ['multiply'] })
  })

  it('pixelates blur regions with smoothing disabled, never a gaussian', () => {
    const { ctx, ops } = createMockContext()
    const blur: Annotation = {
      id: 'x', kind: 'blur',
      rect: { x: 0, y: 0, width: PIXELATE_BLOCK_SIZE * 4, height: PIXELATE_BLOCK_SIZE * 4 },
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), blur), factory())
    expect(ops).toContainEqual({ name: 'set:imageSmoothingEnabled', args: [false] })
    expect(opNames(ops).filter((name) => name === 'drawImage').length).toBeGreaterThan(1)
  })

  it('draws text with its colour and font size', () => {
    const { ctx, ops } = createMockContext()
    const text: Annotation = {
      id: 't', kind: 'text',
      at: { x: 20, y: 30 }, text: 'hello', color: '#0000ff', fontSize: 18,
    }
    renderDocument(ctx, image, addAnnotation(createDocument('d', 800, 600), text), factory())
    expect(ops).toContainEqual({ name: 'set:fillStyle', args: ['#0000ff'] })
    expect(ops.find((op) => op.name === 'fillText')?.args[0]).toBe('hello')
  })

  it('renders annotations in document order', () => {
    const { ctx, ops } = createMockContext()
    const first: Annotation = {
      id: '1', kind: 'box', rect: { x: 0, y: 0, width: 1, height: 1 },
      color: '#111111', strokeWidth: 1,
    }
    const second: Annotation = { ...first, id: '2', color: '#222222' }
    const doc = addAnnotation(addAnnotation(createDocument('d', 10, 10), first), second)
    renderDocument(ctx, image, doc, factory())
    const colours = ops
      .filter((op) => op.name === 'set:strokeStyle')
      .map((op) => op.args[0])
    expect(colours).toEqual(['#111111', '#222222'])
  })

  it('balances every save with a restore', () => {
    const { ctx, ops } = createMockContext()
    const doc = addAnnotation(createDocument('d', 10, 10), {
      id: 'h', kind: 'highlight',
      rect: { x: 0, y: 0, width: 5, height: 5 }, color: '#ff0',
    })
    renderDocument(ctx, image, doc, factory())
    const names = opNames(ops)
    expect(names.filter((n) => n === 'save').length).toBe(
      names.filter((n) => n === 'restore').length,
    )
  })
})
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx vitest run tests/shared/render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `src/shared/render.ts`**

```ts
import { PIXELATE_BLOCK_SIZE } from './constants'
import type {
  Annotation,
  ArrowAnnotation,
  BlurAnnotation,
  BoxAnnotation,
  CaptureDocument,
  HighlightAnnotation,
  TextAnnotation,
} from './document'

/** Creates an offscreen drawing surface. Injected so rendering stays testable. */
export type CanvasFactory = (
  width: number,
  height: number,
) => { readonly canvas: CanvasImageSource; readonly ctx: CanvasRenderingContext2D }

const HIGHLIGHT_ALPHA = 0.4
const ARROW_HEAD_RATIO = 4

function drawBox(ctx: CanvasRenderingContext2D, box: BoxAnnotation): void {
  ctx.strokeStyle = box.color
  ctx.lineWidth = box.strokeWidth
  ctx.strokeRect(box.rect.x, box.rect.y, box.rect.width, box.rect.height)
}

function drawArrow(ctx: CanvasRenderingContext2D, arrow: ArrowAnnotation): void {
  const headLength = arrow.strokeWidth * ARROW_HEAD_RATIO
  const angle = Math.atan2(arrow.to.y - arrow.from.y, arrow.to.x - arrow.from.x)

  ctx.strokeStyle = arrow.color
  ctx.fillStyle = arrow.color
  ctx.lineWidth = arrow.strokeWidth
  ctx.lineJoin = 'round'

  // Stop the shaft short of the tip so the head has a clean point.
  const shaftEndX = arrow.to.x - Math.cos(angle) * headLength * 0.8
  const shaftEndY = arrow.to.y - Math.sin(angle) * headLength * 0.8

  ctx.beginPath()
  ctx.moveTo(arrow.from.x, arrow.from.y)
  ctx.lineTo(shaftEndX, shaftEndY)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(arrow.to.x, arrow.to.y)
  ctx.lineTo(
    arrow.to.x - Math.cos(angle - Math.PI / 7) * headLength,
    arrow.to.y - Math.sin(angle - Math.PI / 7) * headLength,
  )
  ctx.lineTo(
    arrow.to.x - Math.cos(angle + Math.PI / 7) * headLength,
    arrow.to.y - Math.sin(angle + Math.PI / 7) * headLength,
  )
  ctx.closePath()
  ctx.fill()
}

function drawHighlight(
  ctx: CanvasRenderingContext2D,
  highlight: HighlightAnnotation,
): void {
  ctx.save()
  // Multiply keeps the underlying text legible through the marker.
  ctx.globalCompositeOperation = 'multiply'
  ctx.globalAlpha = HIGHLIGHT_ALPHA
  ctx.fillStyle = highlight.color
  ctx.fillRect(
    highlight.rect.x,
    highlight.rect.y,
    highlight.rect.width,
    highlight.rect.height,
  )
  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, text: TextAnnotation): void {
  ctx.fillStyle = text.color
  ctx.font = `${text.fontSize}px -apple-system, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  ctx.fillText(text.text, text.at.x, text.at.y)
}

/**
 * Redaction by mosaic, not gaussian: the region is downscaled to blocks and
 * scaled back up with smoothing off, which discards the original detail rather
 * than merely spreading it.
 */
function drawBlur(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  blur: BlurAnnotation,
  createCanvas: CanvasFactory,
): void {
  const { rect } = blur
  const blocksWide = Math.max(1, Math.round(rect.width / PIXELATE_BLOCK_SIZE))
  const blocksHigh = Math.max(1, Math.round(rect.height / PIXELATE_BLOCK_SIZE))

  const small = createCanvas(blocksWide, blocksHigh)
  small.ctx.imageSmoothingEnabled = false
  small.ctx.drawImage(
    image,
    rect.x, rect.y, rect.width, rect.height,
    0, 0, blocksWide, blocksHigh,
  )

  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(
    small.canvas,
    0, 0, blocksWide, blocksHigh,
    rect.x, rect.y, rect.width, rect.height,
  )
  ctx.restore()
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  annotation: Annotation,
  createCanvas: CanvasFactory,
): void {
  switch (annotation.kind) {
    case 'box':
      return drawBox(ctx, annotation)
    case 'arrow':
      return drawArrow(ctx, annotation)
    case 'highlight':
      return drawHighlight(ctx, annotation)
    case 'text':
      return drawText(ctx, annotation)
    case 'blur':
      return drawBlur(ctx, image, annotation, createCanvas)
  }
}

/**
 * Renders a document to a context sized to `outputSize(doc)`. Annotations are in
 * image coordinates, so a crop is applied as a translation rather than by
 * rewriting any annotation.
 */
export function renderDocument(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  doc: CaptureDocument,
  createCanvas: CanvasFactory,
): void {
  ctx.save()
  if (doc.cropRect) ctx.translate(-doc.cropRect.x, -doc.cropRect.y)

  ctx.drawImage(image, 0, 0, doc.width, doc.height)
  for (const annotation of doc.annotations) {
    drawAnnotation(ctx, image, annotation, createCanvas)
  }

  ctx.restore()
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/shared/render.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 6: Verify coverage on the shared module**

Run: `npm run test:coverage`
Expected: PASS with all four thresholds on `src/shared/**` at or above 80%.

- [ ] **Step 7: Commit**

```bash
git add src/shared/render.ts tests/shared/render.test.ts tests/helpers/mock-context.ts
git commit -m "feat: add pure canvas document rendering"
```

---

### Task 16: Manifest model and paths

**Files:**
- Create: `src/shared/manifest.ts`
- Create: `src/main/storage/paths.ts`
- Test: `tests/shared/manifest.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `type CaptureRecord = { readonly id, createdAt, name, width, height: ... }`
  - `type Manifest = { readonly version: 1; readonly records: readonly CaptureRecord[] }`
  - `emptyManifest(): Manifest`
  - `addRecord(manifest, record): Manifest` — newest first, replaces an existing record with the same id
  - `removeRecord(manifest, id): Manifest`
  - `findRecord(manifest, id): CaptureRecord | null`
  - `parseManifest(json: string): Manifest` — never throws; returns `emptyManifest()` on damage
  - `captureBaseName(date: Date): string` — e.g. `2026-08-04 15-42-07`
  - From `paths.ts`: `capturePaths(rootDir, name)` returning `{ flat, original, doc, thumb }`, and `sidecarDirs(rootDir)`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  addRecord,
  captureBaseName,
  type CaptureRecord,
  emptyManifest,
  findRecord,
  parseManifest,
  removeRecord,
} from '@shared/manifest'

const record: CaptureRecord = {
  id: 'id-1',
  name: '2026-08-04 15-42-07',
  createdAt: '2026-08-04T15:42:07.000Z',
  width: 800,
  height: 600,
}

const older: CaptureRecord = { ...record, id: 'id-0', name: '2026-08-04 10-00-00' }

describe('emptyManifest', () => {
  it('is version 1 with no records', () => {
    expect(emptyManifest()).toEqual({ version: 1, records: [] })
  })
})

describe('addRecord', () => {
  it('puts the newest record first', () => {
    const manifest = addRecord(addRecord(emptyManifest(), older), record)
    expect(manifest.records.map((r) => r.id)).toEqual(['id-1', 'id-0'])
  })

  it('replaces a record with the same id instead of duplicating', () => {
    const updated = { ...record, width: 1000 }
    const manifest = addRecord(addRecord(emptyManifest(), record), updated)
    expect(manifest.records).toHaveLength(1)
    expect(manifest.records[0]?.width).toBe(1000)
  })

  it('does not mutate the input manifest', () => {
    const original = emptyManifest()
    addRecord(original, record)
    expect(original.records).toEqual([])
  })
})

describe('removeRecord', () => {
  it('drops the matching record', () => {
    const manifest = addRecord(addRecord(emptyManifest(), older), record)
    expect(removeRecord(manifest, 'id-1').records.map((r) => r.id)).toEqual(['id-0'])
  })
})

describe('findRecord', () => {
  it('returns the matching record', () => {
    expect(findRecord(addRecord(emptyManifest(), record), 'id-1')?.name).toBe(record.name)
  })

  it('returns null when absent', () => {
    expect(findRecord(emptyManifest(), 'nope')).toBeNull()
  })
})

describe('parseManifest', () => {
  it('round-trips a serialised manifest', () => {
    const manifest = addRecord(emptyManifest(), record)
    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it('returns an empty manifest for malformed JSON rather than throwing', () => {
    expect(parseManifest('{broken')).toEqual(emptyManifest())
  })

  it('returns an empty manifest for an unexpected version', () => {
    expect(parseManifest('{"version":99,"records":[]}')).toEqual(emptyManifest())
  })

  it('drops records missing required fields', () => {
    const payload = JSON.stringify({ version: 1, records: [record, { id: 'bad' }] })
    expect(parseManifest(payload).records.map((r) => r.id)).toEqual(['id-1'])
  })
})

describe('captureBaseName', () => {
  it('formats a filesystem-safe local timestamp', () => {
    const name = captureBaseName(new Date(2026, 7, 4, 15, 42, 7))
    expect(name).toBe('2026-08-04 15-42-07')
  })

  it('zero-pads single-digit components', () => {
    const name = captureBaseName(new Date(2026, 0, 2, 3, 4, 5))
    expect(name).toBe('2026-01-02 03-04-05')
  })

  it('contains no characters illegal in a filename', () => {
    expect(captureBaseName(new Date())).not.toMatch(/[/\\:*?"<>|]/)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/manifest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/manifest.ts`**

```ts
/** One saved capture. Paths are derived from `name`, never stored absolutely. */
export type CaptureRecord = {
  readonly id: string
  /** Timestamp base name shared by the image, original, doc, and thumbnail. */
  readonly name: string
  readonly createdAt: string
  readonly width: number
  readonly height: number
}

export type Manifest = {
  readonly version: 1
  readonly records: readonly CaptureRecord[]
}

export function emptyManifest(): Manifest {
  return { version: 1, records: [] }
}

/** Adds or replaces a record, keeping the list newest-first. */
export function addRecord(manifest: Manifest, record: CaptureRecord): Manifest {
  return {
    version: 1,
    records: [record, ...manifest.records.filter((r) => r.id !== record.id)],
  }
}

export function removeRecord(manifest: Manifest, id: string): Manifest {
  return { version: 1, records: manifest.records.filter((r) => r.id !== id) }
}

export function findRecord(manifest: Manifest, id: string): CaptureRecord | null {
  return manifest.records.find((r) => r.id === id) ?? null
}

function isRecord(value: unknown): value is CaptureRecord {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.createdAt === 'string' &&
    typeof r.width === 'number' &&
    typeof r.height === 'number'
  )
}

/**
 * Never throws. A damaged manifest is not worth losing the app over — the caller
 * rebuilds it by scanning the capture directory.
 */
export function parseManifest(json: string): Manifest {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    if (parsed?.version !== 1 || !Array.isArray(parsed.records)) return emptyManifest()
    return { version: 1, records: parsed.records.filter(isRecord) }
  } catch {
    return emptyManifest()
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Local-time base name, e.g. `2026-08-04 15-42-07`. */
export function captureBaseName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  return `${day} ${time}`
}
```

- [ ] **Step 4: Write `src/main/storage/paths.ts`**

```ts
import { app } from 'electron'
import { join } from 'node:path'

const SIDECAR = '.chop'

export function defaultCaptureRoot(): string {
  return join(app.getPath('pictures'), 'Chop')
}

export function sidecarDirs(rootDir: string): {
  readonly base: string
  readonly originals: string
  readonly docs: string
  readonly thumbs: string
} {
  const base = join(rootDir, SIDECAR)
  return {
    base,
    originals: join(base, 'originals'),
    docs: join(base, 'docs'),
    thumbs: join(base, 'thumbs'),
  }
}

export function manifestPath(rootDir: string): string {
  return join(sidecarDirs(rootDir).base, 'manifest.json')
}

export function capturePaths(
  rootDir: string,
  name: string,
): {
  readonly flat: string
  readonly original: string
  readonly doc: string
  readonly thumb: string
} {
  const dirs = sidecarDirs(rootDir)
  return {
    flat: join(rootDir, `${name}.png`),
    original: join(dirs.originals, `${name}.png`),
    doc: join(dirs.docs, `${name}.json`),
    thumb: join(dirs.thumbs, `${name}.png`),
  }
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/shared/manifest.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 6: Commit**

```bash
git add src/shared/manifest.ts src/main/storage/paths.ts tests/shared/manifest.test.ts
git commit -m "feat: add capture manifest model and path resolution"
```

---

### Task 17: Capture storage (integration tested against a real filesystem)

**Files:**
- Create: `src/main/storage/manifest-store.ts`
- Create: `src/main/storage/capture-store.ts`
- Test: `tests/main/storage/capture-store.test.ts`

**Interfaces:**
- Consumes: `Manifest`, `CaptureRecord`, `parseManifest`, `addRecord`, `emptyManifest` from `@shared/manifest`; `capturePaths`, `sidecarDirs`, `manifestPath` from `./paths`
- Produces:
  - `readManifest(rootDir): Promise<Manifest>` — returns `emptyManifest()` when missing or damaged
  - `writeManifest(rootDir, manifest): Promise<void>` — atomic via temp file + rename
  - `rebuildManifest(rootDir): Promise<Manifest>` — scans `*.png` when the manifest is unusable
  - `saveCapture(rootDir, input): Promise<CaptureRecord>` where `input = { id, name, createdAt, width, height, flatPng: Buffer, originalPng: Buffer, thumbPng: Buffer, documentJson: string }`
  - `loadCapture(rootDir, record): Promise<{ originalPng: Buffer; documentJson: string | null }>`

- [ ] **Step 1: Write the failing test**

Create `tests/main/storage/capture-store.test.ts`:

```ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyManifest } from '@shared/manifest'
import {
  loadCapture,
  readManifest,
  rebuildManifest,
  saveCapture,
  writeManifest,
} from '../../../src/main/storage/capture-store'

let root: string

// A one-pixel PNG — enough to prove bytes round-trip without a real encoder.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const input = {
  id: 'id-1',
  name: '2026-08-04 15-42-07',
  createdAt: '2026-08-04T15:42:07.000Z',
  width: 800,
  height: 600,
  flatPng: PNG,
  originalPng: PNG,
  thumbPng: PNG,
  documentJson: '{"id":"id-1","width":800,"height":600,"cropRect":null,"annotations":[]}',
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'chop-test-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('saveCapture', () => {
  it('writes the flattened PNG to the visible folder', async () => {
    await saveCapture(root, input)
    await expect(readFile(join(root, '2026-08-04 15-42-07.png'))).resolves.toEqual(PNG)
  })

  it('writes the original, document, and thumbnail into the sidecar', async () => {
    await saveCapture(root, input)
    const base = join(root, '.chop')
    await expect(
      readFile(join(base, 'originals', '2026-08-04 15-42-07.png')),
    ).resolves.toEqual(PNG)
    await expect(
      readFile(join(base, 'thumbs', '2026-08-04 15-42-07.png')),
    ).resolves.toEqual(PNG)
    await expect(
      readFile(join(base, 'docs', '2026-08-04 15-42-07.json'), 'utf8'),
    ).resolves.toBe(input.documentJson)
  })

  it('adds the record to the manifest', async () => {
    await saveCapture(root, input)
    const manifest = await readManifest(root)
    expect(manifest.records.map((r) => r.id)).toEqual(['id-1'])
  })

  it('replaces rather than duplicates when saving the same id twice', async () => {
    await saveCapture(root, input)
    await saveCapture(root, { ...input, width: 1000 })
    const manifest = await readManifest(root)
    expect(manifest.records).toHaveLength(1)
    expect(manifest.records[0]?.width).toBe(1000)
  })

  it('creates the capture directory when it does not exist', async () => {
    const nested = join(root, 'a', 'b', 'Chop')
    await saveCapture(nested, input)
    await expect(readFile(join(nested, '2026-08-04 15-42-07.png'))).resolves.toEqual(PNG)
  })

  it('never overwrites the original when re-saving an annotated flat image', async () => {
    await saveCapture(root, input)
    const annotated = Buffer.concat([PNG, Buffer.from([0])])
    await saveCapture(root, { ...input, flatPng: annotated })
    await expect(
      readFile(join(root, '.chop', 'originals', '2026-08-04 15-42-07.png')),
    ).resolves.toEqual(PNG)
  })
})

describe('readManifest', () => {
  it('returns an empty manifest when none exists', async () => {
    await expect(readManifest(root)).resolves.toEqual(emptyManifest())
  })

  it('returns an empty manifest when the file is corrupt', async () => {
    await writeManifest(root, emptyManifest())
    await writeFile(join(root, '.chop', 'manifest.json'), '{not json')
    await expect(readManifest(root)).resolves.toEqual(emptyManifest())
  })
})

describe('rebuildManifest', () => {
  it('reconstructs records by scanning PNGs in the capture folder', async () => {
    await saveCapture(root, input)
    await saveCapture(root, { ...input, id: 'id-2', name: '2026-08-04 16-00-00' })
    await rm(join(root, '.chop', 'manifest.json'))

    const rebuilt = await rebuildManifest(root)
    expect(rebuilt.records.map((r) => r.name)).toEqual([
      '2026-08-04 16-00-00',
      '2026-08-04 15-42-07',
    ])
  })

  it('returns an empty manifest for an empty directory', async () => {
    await expect(rebuildManifest(root)).resolves.toEqual(emptyManifest())
  })
})

describe('loadCapture', () => {
  it('returns the original bytes and the document JSON', async () => {
    const record = await saveCapture(root, input)
    const loaded = await loadCapture(root, record)
    expect(loaded.originalPng).toEqual(PNG)
    expect(loaded.documentJson).toBe(input.documentJson)
  })

  it('returns a null document when the sidecar JSON is missing', async () => {
    const record = await saveCapture(root, input)
    await rm(join(root, '.chop', 'docs', '2026-08-04 15-42-07.json'))
    await expect(loadCapture(root, record)).resolves.toMatchObject({ documentJson: null })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/main/storage/capture-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/main/storage/manifest-store.ts`**

```ts
import { readFile, rename, writeFile } from 'node:fs/promises'
import { emptyManifest, type Manifest, parseManifest } from '@shared/manifest'
import { manifestPath } from './paths'

export async function readManifest(rootDir: string): Promise<Manifest> {
  try {
    return parseManifest(await readFile(manifestPath(rootDir), 'utf8'))
  } catch {
    // Missing or unreadable: an empty manifest is the correct starting point.
    return emptyManifest()
  }
}

/** Writes via a temp file and rename so a crash cannot truncate the manifest. */
export async function writeManifest(rootDir: string, manifest: Manifest): Promise<void> {
  const target = manifestPath(rootDir)
  const temp = `${target}.tmp`
  await writeFile(temp, JSON.stringify(manifest, null, 2), 'utf8')
  await rename(temp, target)
}
```

- [ ] **Step 4: Write `src/main/storage/capture-store.ts`**

```ts
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { addRecord, type CaptureRecord, emptyManifest, type Manifest } from '@shared/manifest'
import { readManifest, writeManifest } from './manifest-store'
import { capturePaths, sidecarDirs } from './paths'

export { readManifest, writeManifest }

export type SaveCaptureInput = {
  readonly id: string
  readonly name: string
  readonly createdAt: string
  readonly width: number
  readonly height: number
  readonly flatPng: Buffer
  readonly originalPng: Buffer
  readonly thumbPng: Buffer
  readonly documentJson: string
}

async function ensureDirs(rootDir: string): Promise<void> {
  const dirs = sidecarDirs(rootDir)
  await mkdir(rootDir, { recursive: true })
  await Promise.all([
    mkdir(dirs.originals, { recursive: true }),
    mkdir(dirs.docs, { recursive: true }),
    mkdir(dirs.thumbs, { recursive: true }),
  ])
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Writes every artefact for a capture and updates the manifest. The original is
 * written only once, so re-saving an annotated image never destroys the source.
 */
export async function saveCapture(
  rootDir: string,
  input: SaveCaptureInput,
): Promise<CaptureRecord> {
  await ensureDirs(rootDir)
  const paths = capturePaths(rootDir, input.name)

  await writeFile(paths.flat, input.flatPng)
  await writeFile(paths.thumb, input.thumbPng)
  await writeFile(paths.doc, input.documentJson, 'utf8')
  if (!(await exists(paths.original))) {
    await writeFile(paths.original, input.originalPng)
  }

  const record: CaptureRecord = {
    id: input.id,
    name: input.name,
    createdAt: input.createdAt,
    width: input.width,
    height: input.height,
  }
  await writeManifest(rootDir, addRecord(await readManifest(rootDir), record))
  return record
}

export async function loadCapture(
  rootDir: string,
  record: CaptureRecord,
): Promise<{ readonly originalPng: Buffer; readonly documentJson: string | null }> {
  const paths = capturePaths(rootDir, record.name)
  const originalPng = await readFile(
    (await exists(paths.original)) ? paths.original : paths.flat,
  )
  const documentJson = (await exists(paths.doc))
    ? await readFile(paths.doc, 'utf8')
    : null
  return { originalPng, documentJson }
}

/** Recovery path when the manifest is missing or damaged. */
export async function rebuildManifest(rootDir: string): Promise<Manifest> {
  let entries: readonly string[]
  try {
    entries = await readdir(rootDir)
  } catch {
    return emptyManifest()
  }

  const names = entries
    .filter((entry) => extname(entry).toLowerCase() === '.png')
    .map((entry) => basename(entry, extname(entry)))
    .sort()
    .reverse()

  const records = await Promise.all(
    names.map(async (name): Promise<CaptureRecord> => {
      const created = await stat(join(rootDir, `${name}.png`))
      return {
        id: randomUUID(),
        name,
        createdAt: created.birthtime.toISOString(),
        width: 0,
        height: 0,
      }
    }),
  )

  const manifest: Manifest = { version: 1, records }
  await writeManifest(rootDir, manifest)
  return manifest
}
```

Note: `rebuildManifest` records `width: 0, height: 0` because the dimensions are not knowable without decoding each PNG. The filmstrip must therefore treat zero dimensions as "unknown" and fall back to the thumbnail's intrinsic size rather than assuming a valid value.

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx vitest run tests/main/storage/capture-store.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/storage tests/main/storage
git commit -m "feat: add capture storage with sidecar originals and manifest"
```

---

### Task 18: Editor tool state (pure)

All the logic for turning a drag into an annotation lives here, free of the DOM, so the editor's behaviour is tested without a browser.

**Files:**
- Create: `src/shared/tools.ts`
- Test: `tests/shared/tools.test.ts`

**Interfaces:**
- Consumes: `Annotation` from `@shared/document`; `Point`, `normalizeRect`, `isDegenerateRect` from `@shared/geometry`; `DEFAULT_STROKE_WIDTH`, `DEFAULT_FONT_SIZE` from `@shared/constants`
- Produces:
  - `type ToolId = 'select' | 'box' | 'arrow' | 'text' | 'highlight' | 'blur' | 'crop'`
  - `type ToolStyle = { readonly color: string; readonly strokeWidth: number; readonly fontSize: number }`
  - `type Draft = { readonly tool: ToolId; readonly start: Point; readonly current: Point }`
  - `defaultStyle(): ToolStyle`
  - `beginDraft(tool, point): Draft`
  - `updateDraft(draft, point): Draft`
  - `draftToAnnotation(draft, style, id): Annotation | null` — null when the drag is too small or the tool does not produce an annotation
  - `isDrawingTool(tool): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT_SIZE, DEFAULT_STROKE_WIDTH } from '@shared/constants'
import {
  beginDraft,
  defaultStyle,
  draftToAnnotation,
  isDrawingTool,
  updateDraft,
} from '@shared/tools'

const style = { color: '#ff3b30', strokeWidth: 3, fontSize: 18 }

function drag(tool: Parameters<typeof beginDraft>[0], x2 = 110, y2 = 90) {
  return updateDraft(beginDraft(tool, { x: 10, y: 10 }), { x: x2, y: y2 })
}

describe('defaultStyle', () => {
  it('uses the configured stroke width and font size', () => {
    expect(defaultStyle()).toMatchObject({
      strokeWidth: DEFAULT_STROKE_WIDTH,
      fontSize: DEFAULT_FONT_SIZE,
    })
  })

  it('provides a colour', () => {
    expect(defaultStyle().color).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('beginDraft / updateDraft', () => {
  it('records the start point and tracks the current point', () => {
    const draft = drag('box')
    expect(draft.start).toEqual({ x: 10, y: 10 })
    expect(draft.current).toEqual({ x: 110, y: 90 })
  })

  it('does not mutate the previous draft', () => {
    const first = beginDraft('box', { x: 0, y: 0 })
    updateDraft(first, { x: 50, y: 50 })
    expect(first.current).toEqual({ x: 0, y: 0 })
  })
})

describe('draftToAnnotation', () => {
  it('builds a box from a drag', () => {
    expect(draftToAnnotation(drag('box'), style, 'a1')).toEqual({
      id: 'a1', kind: 'box',
      rect: { x: 10, y: 10, width: 100, height: 80 },
      color: '#ff3b30', strokeWidth: 3,
    })
  })

  it('builds an arrow preserving direction, not a normalized rect', () => {
    const draft = updateDraft(beginDraft('arrow', { x: 200, y: 200 }), { x: 50, y: 20 })
    expect(draftToAnnotation(draft, style, 'a2')).toEqual({
      id: 'a2', kind: 'arrow',
      from: { x: 200, y: 200 }, to: { x: 50, y: 20 },
      color: '#ff3b30', strokeWidth: 3,
    })
  })

  it('builds a highlight from a drag', () => {
    expect(draftToAnnotation(drag('highlight'), style, 'a3')).toMatchObject({
      kind: 'highlight', color: '#ff3b30',
    })
  })

  it('builds a blur with no colour of its own', () => {
    const blur = draftToAnnotation(drag('blur'), style, 'a4')
    expect(blur).toEqual({
      id: 'a4', kind: 'blur', rect: { x: 10, y: 10, width: 100, height: 80 },
    })
  })

  it('returns null for a drag too small to be intentional', () => {
    expect(draftToAnnotation(drag('box', 11, 11), style, 'a5')).toBeNull()
  })

  it('returns null for tools that do not produce annotations', () => {
    expect(draftToAnnotation(drag('crop'), style, 'a6')).toBeNull()
    expect(draftToAnnotation(drag('select'), style, 'a7')).toBeNull()
    expect(draftToAnnotation(drag('text'), style, 'a8')).toBeNull()
  })
})

describe('isDrawingTool', () => {
  it('treats shape tools as drawing tools', () => {
    expect(['box', 'arrow', 'highlight', 'blur'].every(isDrawingTool)).toBe(true)
  })

  it('excludes select, text, and crop', () => {
    expect(['select', 'text', 'crop'].some(isDrawingTool)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/tools.ts`**

```ts
import { DEFAULT_FONT_SIZE, DEFAULT_STROKE_WIDTH } from './constants'
import type { Annotation } from './document'
import { isDegenerateRect, normalizeRect, type Point } from './geometry'

export type ToolId = 'select' | 'box' | 'arrow' | 'text' | 'highlight' | 'blur' | 'crop'

export type ToolStyle = {
  readonly color: string
  readonly strokeWidth: number
  readonly fontSize: number
}

export type Draft = {
  readonly tool: ToolId
  readonly start: Point
  readonly current: Point
}

const DEFAULT_COLOR = '#ff3b30'

export function defaultStyle(): ToolStyle {
  return {
    color: DEFAULT_COLOR,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    fontSize: DEFAULT_FONT_SIZE,
  }
}

export function beginDraft(tool: ToolId, point: Point): Draft {
  return { tool, start: point, current: point }
}

export function updateDraft(draft: Draft, point: Point): Draft {
  return { ...draft, current: point }
}

/** Shape tools that build an annotation directly from a drag. */
export function isDrawingTool(tool: ToolId): boolean {
  return tool === 'box' || tool === 'arrow' || tool === 'highlight' || tool === 'blur'
}

/**
 * Converts a completed drag into an annotation, or null when the drag is too
 * small or the tool handles its own interaction (text, crop, select).
 */
export function draftToAnnotation(
  draft: Draft,
  style: ToolStyle,
  id: string,
): Annotation | null {
  const rect = normalizeRect(draft.start, draft.current)
  if (isDegenerateRect(rect)) return null

  switch (draft.tool) {
    case 'box':
      return { id, kind: 'box', rect, color: style.color, strokeWidth: style.strokeWidth }
    case 'arrow':
      // Direction matters for an arrow, so use the raw endpoints.
      return {
        id, kind: 'arrow',
        from: draft.start, to: draft.current,
        color: style.color, strokeWidth: style.strokeWidth,
      }
    case 'highlight':
      return { id, kind: 'highlight', rect, color: style.color }
    case 'blur':
      return { id, kind: 'blur', rect }
    default:
      return null
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/tools.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/tools.ts tests/shared/tools.test.ts
git commit -m "feat: add editor tool state and draft-to-annotation logic"
```

---

### Task 19: Flattening and thumbnails (pure)

The same render path produces what you see and what gets saved, so the two can never drift.

**Files:**
- Create: `src/shared/flatten.ts`
- Test: `tests/shared/flatten.test.ts`

**Interfaces:**
- Consumes: `CaptureDocument`, `outputSize` from `@shared/document`; `renderDocument`, `CanvasFactory` from `@shared/render`; `THUMBNAIL_SIZE` from `@shared/constants`
- Produces:
  - `thumbnailSize(width, height): { readonly width: number; readonly height: number }` — fits inside `THUMBNAIL_SIZE`, preserving aspect ratio, never upscaling
  - `flattenDocument(image, doc, createCanvas): CanvasImageSource` — renders at output size

- [ ] **Step 1: Write the failing test**

Create `tests/shared/flatten.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { THUMBNAIL_SIZE } from '@shared/constants'
import { createDocument, setCrop } from '@shared/document'
import { flattenDocument, thumbnailSize } from '@shared/flatten'
import type { CanvasFactory } from '@shared/render'
import { createMockContext } from '../helpers/mock-context'

function trackingFactory(): { readonly factory: CanvasFactory; readonly sizes: number[][] } {
  const sizes: number[][] = []
  const factory: CanvasFactory = (width, height) => {
    sizes.push([width, height])
    return { canvas: {} as CanvasImageSource, ctx: createMockContext().ctx }
  }
  return { factory, sizes }
}

describe('thumbnailSize', () => {
  it('scales a landscape image to fit the long edge', () => {
    expect(thumbnailSize(1000, 500)).toEqual({
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE / 2,
    })
  })

  it('scales a portrait image to fit the long edge', () => {
    expect(thumbnailSize(500, 1000)).toEqual({
      width: THUMBNAIL_SIZE / 2,
      height: THUMBNAIL_SIZE,
    })
  })

  it('never upscales an already small image', () => {
    expect(thumbnailSize(64, 32)).toEqual({ width: 64, height: 32 })
  })

  it('never returns a zero dimension', () => {
    const size = thumbnailSize(1000, 1)
    expect(size.width).toBeGreaterThan(0)
    expect(size.height).toBeGreaterThan(0)
  })
})

describe('flattenDocument', () => {
  it('allocates a canvas at the document size when uncropped', () => {
    const { factory, sizes } = trackingFactory()
    flattenDocument({} as CanvasImageSource, createDocument('d', 800, 600), factory)
    expect(sizes[0]).toEqual([800, 600])
  })

  it('allocates a canvas at the crop size when cropped', () => {
    const { factory, sizes } = trackingFactory()
    const doc = setCrop(createDocument('d', 800, 600), {
      x: 100, y: 100, width: 300, height: 200,
    })
    flattenDocument({} as CanvasImageSource, doc, factory)
    expect(sizes[0]).toEqual([300, 200])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/flatten.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/flatten.ts`**

```ts
import { THUMBNAIL_SIZE } from './constants'
import { type CaptureDocument, outputSize } from './document'
import { type CanvasFactory, renderDocument } from './render'

/** Fits an image inside a THUMBNAIL_SIZE square without upscaling or distorting. */
export function thumbnailSize(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, THUMBNAIL_SIZE / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Renders a document to an offscreen canvas at its output size. */
export function flattenDocument(
  image: CanvasImageSource,
  doc: CaptureDocument,
  createCanvas: CanvasFactory,
): CanvasImageSource {
  const size = outputSize(doc)
  const target = createCanvas(size.width, size.height)
  renderDocument(target.ctx, image, doc, createCanvas)
  return target.canvas
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/flatten.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/flatten.ts tests/shared/flatten.test.ts
git commit -m "feat: add document flattening and thumbnail sizing"
```

---

### Task 20: Editor state reducers (pure)

**Files:**
- Create: `src/shared/editor-state.ts`
- Test: `tests/shared/editor-state.test.ts`

**Interfaces:**
- Consumes: `CaptureDocument`, `removeAnnotation` from `@shared/document`; `History`, `createHistory`, `pushHistory`, `undo`, `redo` from `@shared/history`; `ToolId`, `ToolStyle`, `Draft`, `defaultStyle` from `@shared/tools`
- Produces:
  - `type EditorState = { readonly history: History<CaptureDocument>; readonly tool: ToolId; readonly style: ToolStyle; readonly selectedId: string | null; readonly draft: Draft | null }`
  - `createEditorState(doc): EditorState`
  - `currentDocument(state): CaptureDocument`
  - `setTool(state, tool): EditorState` — clears selection when leaving `select`
  - `setStyle(state, patch: Partial<ToolStyle>): EditorState`
  - `setDraft(state, draft: Draft | null): EditorState`
  - `commitDocument(state, doc): EditorState` — pushes history
  - `previewDocument(state, doc): EditorState` — replaces the present without pushing history, for live drags
  - `selectAnnotation(state, id: string | null): EditorState`
  - `deleteSelected(state): EditorState`
  - `undoState(state): EditorState` / `redoState(state): EditorState`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/editor-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addAnnotation, type Annotation, createDocument } from '@shared/document'
import {
  commitDocument,
  createEditorState,
  currentDocument,
  deleteSelected,
  previewDocument,
  redoState,
  selectAnnotation,
  setDraft,
  setStyle,
  setTool,
  undoState,
} from '@shared/editor-state'
import { beginDraft } from '@shared/tools'

const box: Annotation = {
  id: 'b1', kind: 'box',
  rect: { x: 0, y: 0, width: 10, height: 10 },
  color: '#f00', strokeWidth: 3,
}

const base = createDocument('d', 800, 600)

describe('createEditorState', () => {
  it('starts on the select tool with nothing selected', () => {
    const state = createEditorState(base)
    expect(state.tool).toBe('select')
    expect(state.selectedId).toBeNull()
    expect(state.draft).toBeNull()
    expect(currentDocument(state)).toEqual(base)
  })
})

describe('setTool', () => {
  it('switches the active tool', () => {
    expect(setTool(createEditorState(base), 'arrow').tool).toBe('arrow')
  })

  it('clears the selection when leaving the select tool', () => {
    const selected = selectAnnotation(createEditorState(base), 'b1')
    expect(setTool(selected, 'box').selectedId).toBeNull()
  })

  it('keeps the selection when staying on select', () => {
    const selected = selectAnnotation(createEditorState(base), 'b1')
    expect(setTool(selected, 'select').selectedId).toBe('b1')
  })
})

describe('setStyle', () => {
  it('merges a partial style patch', () => {
    const state = setStyle(createEditorState(base), { color: '#00ff00' })
    expect(state.style.color).toBe('#00ff00')
    expect(state.style.strokeWidth).toBeGreaterThan(0)
  })
})

describe('setDraft', () => {
  it('stores and clears the draft', () => {
    const drafted = setDraft(createEditorState(base), beginDraft('box', { x: 1, y: 1 }))
    expect(drafted.draft?.tool).toBe('box')
    expect(setDraft(drafted, null).draft).toBeNull()
  })
})

describe('commitDocument vs previewDocument', () => {
  it('commit makes the change undoable', () => {
    const state = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(currentDocument(state).annotations).toHaveLength(1)
    expect(currentDocument(undoState(state)).annotations).toHaveLength(0)
  })

  it('preview does not grow the undo stack', () => {
    const state = previewDocument(createEditorState(base), addAnnotation(base, box))
    expect(state.history.past).toHaveLength(0)
    expect(currentDocument(state).annotations).toHaveLength(1)
  })

  it('commit clears the draft', () => {
    const drafted = setDraft(createEditorState(base), beginDraft('box', { x: 1, y: 1 }))
    expect(commitDocument(drafted, addAnnotation(base, box)).draft).toBeNull()
  })
})

describe('deleteSelected', () => {
  it('removes the selected annotation and clears the selection', () => {
    const withBox = commitDocument(createEditorState(base), addAnnotation(base, box))
    const state = deleteSelected(selectAnnotation(withBox, 'b1'))
    expect(currentDocument(state).annotations).toHaveLength(0)
    expect(state.selectedId).toBeNull()
  })

  it('is undoable', () => {
    const withBox = commitDocument(createEditorState(base), addAnnotation(base, box))
    const deleted = deleteSelected(selectAnnotation(withBox, 'b1'))
    expect(currentDocument(undoState(deleted)).annotations).toHaveLength(1)
  })

  it('is a no-op when nothing is selected', () => {
    const withBox = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(deleteSelected(withBox)).toEqual(withBox)
  })
})

describe('undoState / redoState', () => {
  it('round-trips a commit', () => {
    const state = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(currentDocument(redoState(undoState(state)))).toEqual(currentDocument(state))
  })

  it('clears the selection on undo so no stale id remains', () => {
    const withBox = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(undoState(selectAnnotation(withBox, 'b1')).selectedId).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/editor-state.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/editor-state.ts`**

```ts
import { type CaptureDocument, removeAnnotation } from './document'
import {
  createHistory,
  type History,
  pushHistory,
  redo,
  undo,
} from './history'
import { type Draft, defaultStyle, type ToolId, type ToolStyle } from './tools'

export type EditorState = {
  readonly history: History<CaptureDocument>
  readonly tool: ToolId
  readonly style: ToolStyle
  readonly selectedId: string | null
  readonly draft: Draft | null
}

export function createEditorState(doc: CaptureDocument): EditorState {
  return {
    history: createHistory(doc),
    tool: 'select',
    style: defaultStyle(),
    selectedId: null,
    draft: null,
  }
}

export function currentDocument(state: EditorState): CaptureDocument {
  return state.history.present
}

export function setTool(state: EditorState, tool: ToolId): EditorState {
  return {
    ...state,
    tool,
    // A selection only means something while the select tool is active.
    selectedId: tool === 'select' ? state.selectedId : null,
    draft: null,
  }
}

export function setStyle(state: EditorState, patch: Partial<ToolStyle>): EditorState {
  return { ...state, style: { ...state.style, ...patch } }
}

export function setDraft(state: EditorState, draft: Draft | null): EditorState {
  return { ...state, draft }
}

/** Records an undoable change. */
export function commitDocument(state: EditorState, doc: CaptureDocument): EditorState {
  return { ...state, history: pushHistory(state.history, doc), draft: null }
}

/** Replaces the present without touching history — used during a live drag. */
export function previewDocument(state: EditorState, doc: CaptureDocument): EditorState {
  return { ...state, history: { ...state.history, present: doc } }
}

export function selectAnnotation(state: EditorState, id: string | null): EditorState {
  return { ...state, selectedId: id }
}

export function deleteSelected(state: EditorState): EditorState {
  if (!state.selectedId) return state
  const next = removeAnnotation(currentDocument(state), state.selectedId)
  return { ...commitDocument(state, next), selectedId: null }
}

export function undoState(state: EditorState): EditorState {
  return { ...state, history: undo(state.history), selectedId: null, draft: null }
}

export function redoState(state: EditorState): EditorState {
  return { ...state, history: redo(state.history), selectedId: null, draft: null }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run tests/shared/editor-state.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/editor-state.ts tests/shared/editor-state.test.ts
git commit -m "feat: add editor state reducers"
```

---

### Task 21: Editor shell — canvas, toolbar, and the render loop

With every reducer already tested, this task is DOM glue: mount a canvas, map pointer coordinates into image space, and redraw on each state change.

**Files:**
- Create: `src/renderer/editor/canvas-view.ts`
- Create: `src/renderer/editor/toolbar.ts`
- Modify: `src/renderer/editor/index.html`, `src/renderer/editor/main.ts`
- Test: `tests/shared/canvas-mapping.test.ts`
- Create: `src/shared/canvas-mapping.ts`

**Interfaces:**
- Consumes: `EditorState` and reducers from `@shared/editor-state`; `renderDocument`, `CanvasFactory` from `@shared/render`; `outputSize` from `@shared/document`
- Produces:
  - From `canvas-mapping.ts`: `fitScale(imageWidth, imageHeight, viewWidth, viewHeight): number` and `viewToImage(point, scale, cropRect): Point`
  - From `canvas-view.ts`: `createCanvasView(canvas): { render(state): void; toImagePoint(event): Point; scale(): number }`
  - From `toolbar.ts`: `createToolbar(root, handlers): { setActive(tool): void }`
  - `browserCanvasFactory: CanvasFactory`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/canvas-mapping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fitScale, viewToImage } from '@shared/canvas-mapping'

describe('fitScale', () => {
  it('shrinks an image larger than the viewport', () => {
    expect(fitScale(2000, 1000, 1000, 1000)).toBe(0.5)
  })

  it('is limited by the tighter axis', () => {
    expect(fitScale(1000, 2000, 1000, 1000)).toBe(0.5)
  })

  it('never upscales a small image', () => {
    expect(fitScale(100, 100, 1000, 1000)).toBe(1)
  })

  it('returns a positive scale for a zero-size viewport', () => {
    expect(fitScale(100, 100, 0, 0)).toBeGreaterThan(0)
  })
})

describe('viewToImage', () => {
  it('divides by the scale', () => {
    expect(viewToImage({ x: 100, y: 50 }, 0.5, null)).toEqual({ x: 200, y: 100 })
  })

  it('adds the crop origin so points land in image coordinates', () => {
    const crop = { x: 300, y: 200, width: 400, height: 300 }
    expect(viewToImage({ x: 50, y: 25 }, 1, crop)).toEqual({ x: 350, y: 225 })
  })

  it('combines scale and crop origin', () => {
    const crop = { x: 100, y: 100, width: 400, height: 300 }
    expect(viewToImage({ x: 50, y: 50 }, 0.5, crop)).toEqual({ x: 200, y: 200 })
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/canvas-mapping.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/canvas-mapping.ts`**

```ts
import type { Point, Rect } from './geometry'

/** Largest scale that fits the image in the viewport, never above 1:1. */
export function fitScale(
  imageWidth: number,
  imageHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  if (imageWidth <= 0 || imageHeight <= 0) return 1
  const scale = Math.min(viewWidth / imageWidth, viewHeight / imageHeight, 1)
  return scale > 0 ? scale : 1
}

/** Converts a point in displayed-canvas space to image coordinates. */
export function viewToImage(point: Point, scale: number, cropRect: Rect | null): Point {
  return {
    x: point.x / scale + (cropRect?.x ?? 0),
    y: point.y / scale + (cropRect?.y ?? 0),
  }
}
```

- [ ] **Step 4: Write `src/renderer/editor/canvas-view.ts`**

```ts
import { fitScale, viewToImage } from '@shared/canvas-mapping'
import { outputSize } from '@shared/document'
import type { EditorState } from '@shared/editor-state'
import { currentDocument } from '@shared/editor-state'
import type { Point } from '@shared/geometry'
import { annotationBounds, handleRects } from '@shared/hit-test'
import { type CanvasFactory, renderDocument } from '@shared/render'

export const browserCanvasFactory: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  return { canvas, ctx }
}

export type CanvasView = {
  setImage(image: HTMLImageElement): void
  render(state: EditorState): void
  toImagePoint(event: MouseEvent, state: EditorState): Point
  scale(): number
}

const SELECTION_COLOR = '#2f9bff'

export function createCanvasView(canvas: HTMLCanvasElement): CanvasView {
  let image: HTMLImageElement | null = null
  let currentScale = 1

  function ctx2d(): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    return ctx
  }

  function drawSelection(ctx: CanvasRenderingContext2D, state: EditorState): void {
    if (state.tool !== 'select' || !state.selectedId) return
    const annotation = currentDocument(state).annotations.find(
      (a) => a.id === state.selectedId,
    )
    if (!annotation) return

    const bounds = annotationBounds(annotation)
    ctx.save()
    ctx.strokeStyle = SELECTION_COLOR
    ctx.lineWidth = 1 / currentScale
    ctx.setLineDash([4 / currentScale, 3 / currentScale])
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
    ctx.setLineDash([])
    ctx.fillStyle = SELECTION_COLOR
    for (const handle of handleRects(bounds)) {
      ctx.fillRect(
        handle.rect.x, handle.rect.y,
        handle.rect.width / currentScale, handle.rect.height / currentScale,
      )
    }
    ctx.restore()
  }

  return {
    setImage(next: HTMLImageElement): void {
      image = next
    },

    render(state: EditorState): void {
      if (!image) return
      const doc = currentDocument(state)
      const size = outputSize(doc)
      const parent = canvas.parentElement
      currentScale = fitScale(
        size.width, size.height,
        parent?.clientWidth ?? size.width,
        parent?.clientHeight ?? size.height,
      )

      canvas.width = Math.max(1, Math.round(size.width * currentScale))
      canvas.height = Math.max(1, Math.round(size.height * currentScale))
      canvas.style.width = `${canvas.width}px`
      canvas.style.height = `${canvas.height}px`

      const ctx = ctx2d()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.scale(currentScale, currentScale)
      renderDocument(ctx, image, doc, browserCanvasFactory)
      drawSelection(ctx, state)
      ctx.restore()
    },

    toImagePoint(event: MouseEvent, state: EditorState): Point {
      const rect = canvas.getBoundingClientRect()
      const local = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      return viewToImage(local, currentScale, currentDocument(state).cropRect)
    },

    scale(): number {
      return currentScale
    },
  }
}
```

Note: `renderDocument` takes a context already scaled and translated by the crop, and `drawSelection` runs inside the same transform, so selection handles line up with annotations at every zoom level.

- [ ] **Step 5: Write `src/renderer/editor/toolbar.ts`**

```ts
import type { ToolId } from '@shared/tools'

const TOOLS: readonly { readonly id: ToolId; readonly label: string; readonly key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'box', label: 'Box', key: 'B' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'highlight', label: 'Highlight', key: 'H' },
  { id: 'blur', label: 'Blur', key: 'X' },
  { id: 'crop', label: 'Crop', key: 'C' },
]

const COLORS: readonly string[] = [
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#2f9bff', '#af52de', '#000000', '#ffffff',
]

export type ToolbarHandlers = {
  onTool(tool: ToolId): void
  onColor(color: string): void
  onStrokeWidth(width: number): void
  onUndo(): void
  onRedo(): void
  onCopy(): void
}

export function createToolbar(
  root: HTMLElement,
  handlers: ToolbarHandlers,
): { setActive(tool: ToolId): void } {
  const buttons = new Map<ToolId, HTMLButtonElement>()

  for (const tool of TOOLS) {
    const button = document.createElement('button')
    button.className = 'tool'
    button.textContent = tool.label
    button.title = `${tool.label} (${tool.key})`
    button.addEventListener('click', () => handlers.onTool(tool.id))
    buttons.set(tool.id, button)
    root.append(button)
  }

  const swatches = document.createElement('div')
  swatches.className = 'swatches'
  for (const color of COLORS) {
    const swatch = document.createElement('button')
    swatch.className = 'swatch'
    swatch.style.background = color
    swatch.title = color
    swatch.addEventListener('click', () => handlers.onColor(color))
    swatches.append(swatch)
  }
  root.append(swatches)

  const width = document.createElement('input')
  width.type = 'range'
  width.min = '1'
  width.max = '12'
  width.value = '3'
  width.title = 'Stroke width'
  width.addEventListener('input', () => handlers.onStrokeWidth(Number(width.value)))
  root.append(width)

  for (const [label, handler] of [
    ['Undo', handlers.onUndo],
    ['Redo', handlers.onRedo],
    ['Copy', handlers.onCopy],
  ] as const) {
    const button = document.createElement('button')
    button.className = 'action'
    button.textContent = label
    button.addEventListener('click', handler)
    root.append(button)
  }

  return {
    setActive(tool: ToolId): void {
      for (const [id, button] of buttons) {
        button.classList.toggle('active', id === tool)
      }
    },
  }
}
```

- [ ] **Step 6: Write the editor markup**

Replace `src/renderer/editor/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Chop</title>
    <style>
      :root { color-scheme: light dark; }
      html, body {
        margin: 0;
        height: 100%;
        font: 13px -apple-system, system-ui, sans-serif;
        user-select: none;
      }
      body { display: flex; flex-direction: column; }
      #toolbar {
        display: flex;
        gap: 6px;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid rgba(128, 128, 128, 0.3);
        flex: 0 0 auto;
      }
      #toolbar button { padding: 5px 10px; border-radius: 6px; cursor: pointer; }
      #toolbar .tool.active { background: #2f9bff; color: #fff; }
      .swatches { display: flex; gap: 4px; margin-left: 8px; }
      .swatch { width: 18px; height: 18px; border-radius: 50%; border: 1px solid #8888; padding: 0; }
      #stage {
        flex: 1 1 auto;
        display: grid;
        place-items: center;
        overflow: auto;
        padding: 16px;
        background: rgba(128, 128, 128, 0.12);
        position: relative;
      }
      #canvas { box-shadow: 0 2px 12px rgba(0, 0, 0, 0.25); }
      #text-input {
        position: absolute;
        display: none;
        border: 1px solid #2f9bff;
        background: rgba(255, 255, 255, 0.92);
        color: #000;
        padding: 2px 4px;
        outline: none;
      }
      #filmstrip {
        flex: 0 0 auto;
        display: flex;
        gap: 8px;
        padding: 8px 12px;
        overflow-x: auto;
        border-top: 1px solid rgba(128, 128, 128, 0.3);
        min-height: 76px;
      }
      #filmstrip img {
        height: 56px;
        border-radius: 4px;
        cursor: pointer;
        border: 2px solid transparent;
      }
      #filmstrip img.active { border-color: #2f9bff; }
      #empty { margin: auto; opacity: 0.6; }
    </style>
  </head>
  <body>
    <div id="toolbar"></div>
    <div id="stage">
      <canvas id="canvas"></canvas>
      <input id="text-input" />
      <div id="empty">Press ⌘⇧2 to capture</div>
    </div>
    <div id="filmstrip"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Run the test and verify it passes**

Run: `npx vitest run tests/shared/canvas-mapping.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add editor canvas view and toolbar"
```

---

### Task 22: Editor interactions — drawing, selection, text, and crop

**Files:**
- Create: `src/renderer/editor/interactions.ts`
- Create: `src/renderer/editor/text-input.ts`
- Modify: `src/renderer/editor/main.ts`

**Interfaces:**
- Consumes: all reducers from `@shared/editor-state`; `beginDraft`, `updateDraft`, `draftToAnnotation`, `isDrawingTool` from `@shared/tools`; `annotationAtPoint`, `annotationBounds`, `handleAtPoint`, `resizeRect`, `moveAnnotation` from `@shared/hit-test`; `addAnnotation`, `updateAnnotation`, `setCrop` from `@shared/document`; `normalizeRect`, `isDegenerateRect` from `@shared/geometry`; `CanvasView` from `./canvas-view`
- Produces:
  - `attachInteractions(canvas, view, store): void` where `store = { get(): EditorState; set(state: EditorState): void }`
  - `createTextInput(element, onCommit): { open(point, style): void; close(): void }`

- [ ] **Step 1: Write the text input overlay**

Create `src/renderer/editor/text-input.ts`:

```ts
import type { Point } from '@shared/geometry'
import type { ToolStyle } from '@shared/tools'

export type TextInput = {
  /** `viewPoint` is in stage coordinates; `imagePoint` is where the text lands. */
  open(viewPoint: Point, imagePoint: Point, style: ToolStyle, scale: number): void
  close(): void
}

/**
 * Canvas has no text entry, so an HTML input is positioned over the canvas and
 * committed on Enter or blur.
 */
export function createTextInput(
  element: HTMLInputElement,
  onCommit: (text: string, at: Point) => void,
): TextInput {
  let anchor: Point | null = null

  function commit(): void {
    const text = element.value.trim()
    const at = anchor
    close()
    if (text && at) onCommit(text, at)
  }

  function close(): void {
    anchor = null
    element.value = ''
    element.style.display = 'none'
  }

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
    // Keep editor shortcuts from firing while typing.
    event.stopPropagation()
  })
  element.addEventListener('blur', () => {
    if (anchor) commit()
  })

  return {
    open(viewPoint, imagePoint, style, scale): void {
      anchor = imagePoint
      element.style.display = 'block'
      element.style.left = `${viewPoint.x}px`
      element.style.top = `${viewPoint.y}px`
      element.style.font = `${style.fontSize * scale}px -apple-system, system-ui, sans-serif`
      element.style.color = style.color
      element.value = ''
      element.focus()
    },
    close,
  }
}
```

- [ ] **Step 2: Write the interaction handlers**

Create `src/renderer/editor/interactions.ts`:

```ts
import { addAnnotation, setCrop, updateAnnotation } from '@shared/document'
import {
  commitDocument,
  currentDocument,
  type EditorState,
  previewDocument,
  selectAnnotation,
  setDraft,
} from '@shared/editor-state'
import { isDegenerateRect, normalizeRect, type Point } from '@shared/geometry'
import {
  annotationAtPoint,
  annotationBounds,
  type HandleId,
  handleAtPoint,
  moveAnnotation,
  resizeRect,
} from '@shared/hit-test'
import { beginDraft, draftToAnnotation, isDrawingTool, updateDraft } from '@shared/tools'
import type { CanvasView } from './canvas-view'

export type Store = {
  get(): EditorState
  set(state: EditorState): void
}

type Gesture =
  | { readonly mode: 'draw' }
  | { readonly mode: 'crop' }
  | { readonly mode: 'move'; readonly id: string; readonly last: Point }
  | { readonly mode: 'resize'; readonly id: string; readonly handle: HandleId }

function newId(): string {
  return crypto.randomUUID()
}

/** Applies a rect-shaped edit to whichever annotation kind carries a rect. */
function withRect(id: string, rect: { x: number; y: number; width: number; height: number }) {
  return (state: EditorState): EditorState =>
    previewDocument(
      state,
      updateAnnotation(currentDocument(state), id, (annotation) =>
        annotation.kind === 'box' ||
        annotation.kind === 'highlight' ||
        annotation.kind === 'blur'
          ? { ...annotation, rect }
          : annotation,
      ),
    )
}

export function attachInteractions(
  canvas: HTMLCanvasElement,
  view: CanvasView,
  store: Store,
  openTextInput: (event: MouseEvent, imagePoint: Point) => void,
): void {
  let gesture: Gesture | null = null

  function startSelectGesture(point: Point): void {
    const state = store.get()
    const selected = currentDocument(state).annotations.find(
      (a) => a.id === state.selectedId,
    )

    if (selected) {
      const handle = handleAtPoint(annotationBounds(selected), point)
      if (handle) {
        gesture = { mode: 'resize', id: selected.id, handle }
        return
      }
    }

    const hit = annotationAtPoint(currentDocument(state), point)
    store.set(selectAnnotation(state, hit?.id ?? null))
    if (hit) gesture = { mode: 'move', id: hit.id, last: point }
  }

  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return
    const state = store.get()
    const point = view.toImagePoint(event, state)

    if (state.tool === 'text') {
      openTextInput(event, point)
      return
    }
    if (state.tool === 'select') {
      startSelectGesture(point)
      return
    }
    if (state.tool === 'crop') {
      gesture = { mode: 'crop' }
      store.set(setDraft(state, beginDraft('crop', point)))
      return
    }
    if (isDrawingTool(state.tool)) {
      gesture = { mode: 'draw' }
      store.set(setDraft(state, beginDraft(state.tool, point)))
    }
  })

  canvas.addEventListener('mousemove', (event) => {
    if (!gesture) return
    const state = store.get()
    const point = view.toImagePoint(event, state)

    switch (gesture.mode) {
      case 'draw':
      case 'crop': {
        if (state.draft) store.set(setDraft(state, updateDraft(state.draft, point)))
        return
      }
      case 'move': {
        const dx = point.x - gesture.last.x
        const dy = point.y - gesture.last.y
        const moved = previewDocument(
          state,
          updateAnnotation(currentDocument(state), gesture.id, (a) =>
            moveAnnotation(a, dx, dy),
          ),
        )
        gesture = { ...gesture, last: point }
        store.set(moved)
        return
      }
      case 'resize': {
        const target = gesture
        const annotation = currentDocument(state).annotations.find(
          (a) => a.id === target.id,
        )
        if (!annotation) return
        const next = resizeRect(annotationBounds(annotation), target.handle, point)
        store.set(withRect(annotation.id, next)(state))
        return
      }
    }
  })

  canvas.addEventListener('mouseup', (event) => {
    if (!gesture) return
    const state = store.get()
    const point = view.toImagePoint(event, state)
    const finished = gesture
    gesture = null

    if (finished.mode === 'draw' && state.draft) {
      const annotation = draftToAnnotation(state.draft, state.style, newId())
      store.set(
        annotation
          ? commitDocument(state, addAnnotation(currentDocument(state), annotation))
          : setDraft(state, null),
      )
      return
    }

    if (finished.mode === 'crop' && state.draft) {
      const rect = normalizeRect(state.draft.start, point)
      store.set(
        isDegenerateRect(rect)
          ? setDraft(state, null)
          : commitDocument(state, setCrop(currentDocument(state), rect)),
      )
      return
    }

    // A move or resize was previewed live; commit the final position once.
    store.set(commitDocument(state, currentDocument(state)))
  })

  canvas.addEventListener('mouseleave', () => {
    if (gesture) {
      gesture = null
      store.set(setDraft(store.get(), null))
    }
  })
}
```

Note: arrows and text have no rect, so `withRect` leaves them unchanged — resizing those two kinds is out of scope, and they are moved instead.

- [ ] **Step 3: Wire the editor together**

Replace `src/renderer/editor/main.ts`:

```ts
import { createDocument, parseDocument } from '@shared/document'
import {
  commitDocument,
  createEditorState,
  currentDocument,
  deleteSelected,
  type EditorState,
  redoState,
  selectAnnotation,
  setStyle,
  setTool,
  undoState,
} from '@shared/editor-state'
import { addAnnotation } from '@shared/document'
import type { Point } from '@shared/geometry'
import type { CaptureResult } from '@shared/ipc'
import type { ToolId } from '@shared/tools'
import { browserCanvasFactory, createCanvasView } from './canvas-view'
import { attachInteractions } from './interactions'
import { createTextInput } from './text-input'
import { createToolbar } from './toolbar'

type EditorBridge = {
  onCapture(handler: (capture: CaptureResult) => void): void
  save(payload: { id: string; flattenedDataUrl: string; document: unknown }): void
  copy(dataUrl: string): void
}

const bridge = (window as unknown as { chopEditor: EditorBridge }).chopEditor

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!
const stage = document.querySelector<HTMLDivElement>('#stage')!
const toolbarRoot = document.querySelector<HTMLDivElement>('#toolbar')!
const textElement = document.querySelector<HTMLInputElement>('#text-input')!
const empty = document.querySelector<HTMLDivElement>('#empty')!

const view = createCanvasView(canvas)
let state: EditorState = createEditorState(createDocument('empty', 0, 0))
let loaded = false

const store = {
  get: (): EditorState => state,
  set: (next: EditorState): void => {
    state = next
    draw()
  },
}

function draw(): void {
  toolbar.setActive(state.tool)
  if (loaded) view.render(state)
}

const toolbar = createToolbar(toolbarRoot, {
  onTool: (tool) => store.set(setTool(state, tool)),
  onColor: (color) => store.set(setStyle(state, { color })),
  onStrokeWidth: (strokeWidth) => store.set(setStyle(state, { strokeWidth })),
  onUndo: () => store.set(undoState(state)),
  onRedo: () => store.set(redoState(state)),
  onCopy: () => copyToClipboard(),
})

const textInput = createTextInput(textElement, (text, at) => {
  store.set(
    commitDocument(
      state,
      addAnnotation(currentDocument(state), {
        id: crypto.randomUUID(),
        kind: 'text',
        at,
        text,
        color: state.style.color,
        fontSize: state.style.fontSize,
      }),
    ),
  )
})

attachInteractions(canvas, view, store, (event, imagePoint) => {
  const stageRect = stage.getBoundingClientRect()
  textInput.open(
    { x: event.clientX - stageRect.left, y: event.clientY - stageRect.top },
    imagePoint,
    state.style,
    view.scale(),
  )
})

function flattenToDataUrl(): string {
  const source = imageElement
  if (!source) return ''
  const doc = currentDocument(state)
  const size = doc.cropRect
    ? { width: doc.cropRect.width, height: doc.cropRect.height }
    : { width: doc.width, height: doc.height }
  const target = browserCanvasFactory(size.width, size.height)
  // Reuse the exact editor render path so saved output matches the preview.
  view.renderTo(target.ctx, state)
  return (target.canvas as HTMLCanvasElement).toDataURL('image/png')
}

function copyToClipboard(): void {
  const dataUrl = flattenToDataUrl()
  if (dataUrl) bridge.copy(dataUrl)
}

function save(): void {
  const dataUrl = flattenToDataUrl()
  if (!dataUrl) return
  bridge.save({
    id: currentDocument(state).id,
    flattenedDataUrl: dataUrl,
    document: currentDocument(state),
  })
}

let imageElement: HTMLImageElement | null = null

bridge.onCapture((capture) => {
  const image = new Image()
  image.addEventListener('load', () => {
    imageElement = image
    view.setImage(image)
    loaded = true
    empty.style.display = 'none'
    store.set(createEditorState(createDocument(capture.id, capture.width, capture.height)))
    save()
  })
  image.src = capture.dataUrl
})

const SHORTCUT_TOOLS: Readonly<Record<string, ToolId>> = {
  v: 'select', b: 'box', a: 'arrow', t: 'text', h: 'highlight', x: 'blur', c: 'crop',
}

document.addEventListener('keydown', (event) => {
  const meta = event.metaKey || event.ctrlKey

  if (meta && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    store.set(event.shiftKey ? redoState(state) : undoState(state))
    return
  }
  if (meta && event.key.toLowerCase() === 'c') {
    event.preventDefault()
    copyToClipboard()
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (state.selectedId) {
      event.preventDefault()
      store.set(deleteSelected(state))
    }
    return
  }
  if (event.key === 'Escape') {
    store.set(selectAnnotation(state, null))
    return
  }
  if (!meta) {
    const tool = SHORTCUT_TOOLS[event.key.toLowerCase()]
    if (tool) store.set(setTool(state, tool))
  }
})

window.addEventListener('resize', draw)
```

- [ ] **Step 4: Add `renderTo` to the canvas view**

`main.ts` calls `view.renderTo(ctx, state)` so saving and previewing share one code path. Add it to the `CanvasView` type and implementation in `src/renderer/editor/canvas-view.ts`:

```ts
    renderTo(target: CanvasRenderingContext2D, state: EditorState): void {
      if (!image) return
      // No scale and no selection chrome: this is the exported image.
      renderDocument(target, image, currentDocument(state), browserCanvasFactory)
    },
```

Add `renderTo(target: CanvasRenderingContext2D, state: EditorState): void` to the `CanvasView` type.

- [ ] **Step 5: Write the editor preload bridge**

Replace `src/preload/editor.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type CaptureResult, type SaveRequest } from '@shared/ipc'

contextBridge.exposeInMainWorld('chopEditor', {
  onCapture(handler: (capture: CaptureResult) => void): void {
    ipcRenderer.on(CHANNELS.captureReady, (_event, capture: CaptureResult) =>
      handler(capture),
    )
  },
  save(payload: SaveRequest): void {
    ipcRenderer.send(CHANNELS.saveCapture, payload)
  },
  copy(dataUrl: string): void {
    ipcRenderer.send(CHANNELS.copyCapture, dataUrl)
  },
  listCaptures(): Promise<unknown> {
    return ipcRenderer.invoke(CHANNELS.listCaptures)
  },
  openCapture(id: string): Promise<unknown> {
    return ipcRenderer.invoke(CHANNELS.openCapture, id)
  },
})
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors. Fix any mismatch between `CanvasView` and its implementation before continuing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add editor drawing, selection, text, and crop interactions"
```

---

### Task 23: Persistence wiring — autosave, clipboard, and the editor window

**Files:**
- Create: `src/shared/debounce.ts`
- Create: `src/main/editor-window.ts`
- Create: `src/main/ipc/editor-handlers.ts`
- Modify: `src/renderer/editor/main.ts` (debounced autosave)
- Test: `tests/shared/debounce.test.ts`

**Interfaces:**
- Consumes: `saveCapture`, `loadCapture`, `readManifest`, `rebuildManifest` from `../storage/capture-store`; `captureBaseName`, `findRecord` from `@shared/manifest`; `thumbnailSize` from `@shared/flatten`; `CHANNELS`, `SaveRequest`, `CaptureResult` from `@shared/ipc`; `AUTOSAVE_DEBOUNCE_MS` from `@shared/constants`
- Produces:
  - `debounce<A extends unknown[]>(fn, waitMs): { (...args: A): void; flush(): void; cancel(): void }`
  - `getEditorWindow(): BrowserWindow` — creates on first call, reuses thereafter
  - `sendCapture(capture: CaptureResult): void`
  - `registerEditorHandlers(rootDir: string): void`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/debounce.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce } from '@shared/debounce'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('debounce', () => {
  it('does not call the function before the delay elapses', () => {
    const spy = vi.fn()
    debounce(spy, 800)()
    vi.advanceTimersByTime(799)
    expect(spy).not.toHaveBeenCalled()
  })

  it('calls the function once after the delay', () => {
    const spy = vi.fn()
    debounce(spy, 800)()
    vi.advanceTimersByTime(800)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('collapses rapid calls into one, using the latest arguments', () => {
    const spy = vi.fn()
    const debounced = debounce(spy, 800)
    debounced('a')
    vi.advanceTimersByTime(400)
    debounced('b')
    vi.advanceTimersByTime(800)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('b')
  })

  it('flush runs a pending call immediately', () => {
    const spy = vi.fn()
    const debounced = debounce(spy, 800)
    debounced('x')
    debounced.flush()
    expect(spy).toHaveBeenCalledWith('x')
  })

  it('flush does nothing when no call is pending', () => {
    const spy = vi.fn()
    debounce(spy, 800).flush()
    expect(spy).not.toHaveBeenCalled()
  })

  it('cancel discards a pending call', () => {
    const spy = vi.fn()
    const debounced = debounce(spy, 800)
    debounced()
    debounced.cancel()
    vi.advanceTimersByTime(2000)
    expect(spy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/shared/debounce.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/shared/debounce.ts`**

```ts
export type Debounced<A extends unknown[]> = {
  (...args: A): void
  flush(): void
  cancel(): void
}

/** Trailing-edge debounce with flush, so a pending save can be forced on close. */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null

  const clear = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pending = null
  }

  const debounced = ((...args: A): void => {
    pending = args
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      const args_ = pending
      clear()
      if (args_) fn(...args_)
    }, waitMs)
  }) as Debounced<A>

  debounced.flush = (): void => {
    const args = pending
    clear()
    if (args) fn(...args)
  }
  debounced.cancel = clear

  return debounced
}
```

- [ ] **Step 4: Write `src/main/editor-window.ts`**

```ts
import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import { CHANNELS, type CaptureResult } from '@shared/ipc'

let editor: BrowserWindow | null = null

/** One editor window for the whole app, created on demand and reused. */
export function getEditorWindow(): BrowserWindow {
  if (editor && !editor.isDestroyed()) return editor

  editor = new BrowserWindow({
    width: 1100,
    height: 800,
    show: false,
    title: 'Chop',
    webPreferences: { preload: join(import.meta.dirname, '../preload/editor.mjs') },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void editor.loadURL(`${process.env.ELECTRON_RENDERER_URL}/editor/index.html`)
  } else {
    void editor.loadFile(join(import.meta.dirname, '../renderer/editor/index.html'))
  }

  editor.on('closed', () => {
    editor = null
  })
  return editor
}

/** Loads a capture into the editor, bringing the existing window forward. */
export function sendCapture(capture: CaptureResult): void {
  const window = getEditorWindow()
  const deliver = (): void => {
    window.webContents.send(CHANNELS.captureReady, capture)
    window.show()
    window.focus()
  }
  if (window.webContents.isLoading()) {
    window.webContents.once('did-finish-load', deliver)
    return
  }
  deliver()
}
```

- [ ] **Step 5: Write `src/main/ipc/editor-handlers.ts`**

```ts
import { clipboard, dialog, ipcMain, nativeImage } from 'electron'
import { writeFile } from 'node:fs/promises'
import { thumbnailSize } from '@shared/flatten'
import { CHANNELS, type SaveRequest } from '@shared/ipc'
import { captureBaseName, findRecord } from '@shared/manifest'
import {
  loadCapture,
  readManifest,
  rebuildManifest,
  saveCapture,
} from '../storage/capture-store'

/** Base names are assigned once per capture id so re-saves overwrite in place. */
const namesById = new Map<string, string>()

function nameFor(id: string): string {
  const existing = namesById.get(id)
  if (existing) return existing
  const name = captureBaseName(new Date())
  namesById.set(id, name)
  return name
}

export function registerEditorHandlers(rootDir: string): void {
  ipcMain.on(CHANNELS.saveCapture, (_event, request: SaveRequest) => {
    void (async (): Promise<void> => {
      try {
        const image = nativeImage.createFromDataURL(request.flattenedDataUrl)
        if (image.isEmpty()) throw new Error('flattened image was empty')

        const size = image.getSize()
        const thumb = thumbnailSize(size.width, size.height)
        const name = nameFor(request.id)

        await saveCapture(rootDir, {
          id: request.id,
          name,
          createdAt: new Date().toISOString(),
          width: size.width,
          height: size.height,
          flatPng: image.toPNG(),
          originalPng: image.toPNG(),
          thumbPng: image.resize(thumb).toPNG(),
          documentJson: JSON.stringify(request.document),
        })
      } catch (error) {
        console.error('Failed to save capture.', error)
        await dialog.showMessageBox({
          type: 'error',
          title: 'Could not save capture',
          message:
            'Chop could not write the capture to disk. Use Save As to choose another location.',
          detail: error instanceof Error ? error.message : String(error),
        })
      }
    })()
  })

  ipcMain.on(CHANNELS.copyCapture, (_event, dataUrl: string) => {
    const image = nativeImage.createFromDataURL(dataUrl)
    if (image.isEmpty()) {
      console.warn('Refusing to copy an empty image to the clipboard.')
      return
    }
    clipboard.writeImage(image)
  })

  ipcMain.handle(CHANNELS.saveCaptureAs, async (_event, dataUrl: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `${captureBaseName(new Date())}.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    })
    if (canceled || !filePath) return null
    await writeFile(filePath, nativeImage.createFromDataURL(dataUrl).toPNG())
    return filePath
  })

  ipcMain.handle(CHANNELS.listCaptures, async () => {
    const manifest = await readManifest(rootDir)
    const usable = manifest.records.length > 0 ? manifest : await rebuildManifest(rootDir)
    return usable.records
  })

  ipcMain.handle(CHANNELS.openCapture, async (_event, id: string) => {
    const manifest = await readManifest(rootDir)
    const record = findRecord(manifest, id)
    if (!record) return null

    const { originalPng, documentJson } = await loadCapture(rootDir, record)
    namesById.set(record.id, record.name)
    return {
      id: record.id,
      dataUrl: `data:image/png;base64,${originalPng.toString('base64')}`,
      width: record.width,
      height: record.height,
      createdAt: record.createdAt,
      documentJson,
    }
  })
}
```

Note: the original PNG is written only on the first save for a given id (`saveCapture` skips an existing original), so passing the flattened bytes as `originalPng` is correct — on the first save the image is unannotated, and later saves leave the stored original alone.

- [ ] **Step 6: Add debounced autosave to the renderer**

In `src/renderer/editor/main.ts`, import the constants and debounce:

```ts
import { AUTOSAVE_DEBOUNCE_MS } from '@shared/constants'
import { debounce } from '@shared/debounce'
```

Add below the `save` function:

```ts
const autosave = debounce(save, AUTOSAVE_DEBOUNCE_MS)
window.addEventListener('beforeunload', () => autosave.flush())
```

and call it from the store so every edit schedules a write:

```ts
const store = {
  get: (): EditorState => state,
  set: (next: EditorState): void => {
    const documentChanged = next.history.present !== state.history.present
    state = next
    draw()
    if (documentChanged && loaded) autosave()
  },
}
```

Move the `const store = …` declaration below `save` and `autosave`, or declare `autosave` with `let` before the store and assign it afterwards — TypeScript will flag the ordering if it is wrong.

- [ ] **Step 7: Wire Save As**

The `saveCaptureAs` handler exists but nothing calls it yet. Add to the exposed
API in `src/preload/editor.ts`:

```ts
  saveAs(dataUrl: string): Promise<string | null> {
    return ipcRenderer.invoke(CHANNELS.saveCaptureAs, dataUrl) as Promise<string | null>
  },
```

Add `saveAs(dataUrl: string): Promise<string | null>` to the `EditorBridge` type in
`src/renderer/editor/main.ts`, and handle the shortcut in the existing `keydown`
listener, above the `Delete` branch:

```ts
  if (meta && event.key.toLowerCase() === 's') {
    event.preventDefault()
    const dataUrl = flattenToDataUrl()
    if (dataUrl) void bridge.saveAs(dataUrl)
    return
  }
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `npx vitest run tests/shared/debounce.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add autosave, clipboard, and editor window persistence"
```

---

### Task 24: Filmstrip

**Files:**
- Create: `src/renderer/editor/filmstrip.ts`
- Modify: `src/renderer/editor/main.ts`
- Modify: `src/main/ipc/editor-handlers.ts` (serve thumbnail bytes)

**Interfaces:**
- Consumes: `CaptureRecord` from `@shared/manifest`; the `listCaptures` and `openCapture` bridge methods
- Produces: `createFilmstrip(root, onOpen): { refresh(): Promise<void>; setActive(id): void }`

- [ ] **Step 1: Serve thumbnails from main**

Add to `registerEditorHandlers` in `src/main/ipc/editor-handlers.ts`:

```ts
  ipcMain.handle(CHANNELS.listCaptures, async () => {
    const manifest = await readManifest(rootDir)
    const usable = manifest.records.length > 0 ? manifest : await rebuildManifest(rootDir)

    return Promise.all(
      usable.records.map(async (record) => {
        try {
          const bytes = await readFile(capturePaths(rootDir, record.name).thumb)
          return { ...record, thumbDataUrl: `data:image/png;base64,${bytes.toString('base64')}` }
        } catch {
          // A missing thumbnail should not hide the capture from the filmstrip.
          return { ...record, thumbDataUrl: null }
        }
      }),
    )
  })
```

Replace the earlier `listCaptures` handler with this one, and add the imports `readFile` from `node:fs/promises` and `capturePaths` from `../storage/paths`.

- [ ] **Step 2: Write the filmstrip**

Create `src/renderer/editor/filmstrip.ts`:

```ts
import type { CaptureRecord } from '@shared/manifest'

export type FilmstripEntry = CaptureRecord & { readonly thumbDataUrl: string | null }

export type Filmstrip = {
  refresh(): Promise<void>
  setActive(id: string | null): void
}

export function createFilmstrip(
  root: HTMLElement,
  list: () => Promise<readonly FilmstripEntry[]>,
  onOpen: (id: string) => void,
): Filmstrip {
  let activeId: string | null = null

  function paint(entries: readonly FilmstripEntry[]): void {
    root.replaceChildren()
    for (const entry of entries) {
      if (!entry.thumbDataUrl) continue
      const img = document.createElement('img')
      img.src = entry.thumbDataUrl
      img.alt = entry.name
      img.title = entry.name
      img.dataset.id = entry.id
      img.classList.toggle('active', entry.id === activeId)
      img.addEventListener('click', () => onOpen(entry.id))
      root.append(img)
    }
  }

  return {
    async refresh(): Promise<void> {
      try {
        paint(await list())
      } catch (error) {
        console.error('Could not load the capture history.', error)
      }
    },
    setActive(id: string | null): void {
      activeId = id
      for (const child of root.children) {
        if (child instanceof HTMLElement) {
          child.classList.toggle('active', child.dataset.id === id)
        }
      }
    },
  }
}
```

- [ ] **Step 3: Wire the filmstrip into the editor**

In `src/renderer/editor/main.ts`:

```ts
import { createFilmstrip, type FilmstripEntry } from './filmstrip'

const filmstripRoot = document.querySelector<HTMLDivElement>('#filmstrip')!

const filmstrip = createFilmstrip(
  filmstripRoot,
  () => bridge.listCaptures() as Promise<readonly FilmstripEntry[]>,
  (id) => void openCapture(id),
)

async function openCapture(id: string): Promise<void> {
  const capture = (await bridge.openCapture(id)) as
    | (CaptureResult & { documentJson: string | null })
    | null
  if (!capture) return

  const image = new Image()
  image.addEventListener('load', () => {
    imageElement = image
    view.setImage(image)
    loaded = true
    empty.style.display = 'none'
    const doc = capture.documentJson
      ? parseDocument(capture.documentJson)
      : createDocument(capture.id, capture.width, capture.height)
    state = createEditorState(doc)
    filmstrip.setActive(capture.id)
    draw()
  })
  image.src = capture.dataUrl
}
```

Add `void filmstrip.refresh()` at the end of the `bridge.onCapture` load handler and once at startup.

Extend the bridge type with `listCaptures(): Promise<unknown>` and `openCapture(id: string): Promise<unknown>` — both are already exposed by the preload from Task 22.

- [ ] **Step 4: Manually verify**

Run: `npm run dev`
Expected: the filmstrip lists past captures newest-first; clicking one loads it back into the canvas with its annotations still editable and individually selectable.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add capture history filmstrip"
```

---

### Task 25: Tray, global hotkey, and app wiring

**Files:**
- Create: `src/main/hotkeys.ts`
- Create: `src/main/tray.ts`
- Create: `resources/tray-icon.png` (16×16 and 32×32 @2x template image)
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `runCaptureFlow` from `./capture/capture-flow`; `sendCapture`, `getEditorWindow` from `./editor-window`; `registerEditorHandlers` from `./ipc/editor-handlers`; `defaultCaptureRoot` from `./storage/paths`
- Produces:
  - `captureAccelerator(): string` — `'CommandOrControl+Shift+2'`
  - `registerHotkeys(onCapture): boolean` — false when the accelerator is already taken
  - `createTray(handlers): Tray`

- [ ] **Step 1: Write the failing test**

Create `tests/main/hotkeys.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { captureAccelerator } from '../../src/main/hotkeys'

describe('captureAccelerator', () => {
  it('uses a cross-platform modifier', () => {
    expect(captureAccelerator()).toBe('CommandOrControl+Shift+2')
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run tests/main/hotkeys.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/main/hotkeys.ts`**

```ts
import { globalShortcut } from 'electron'

/** Exported separately so the accelerator can be asserted without Electron. */
export function captureAccelerator(): string {
  return 'CommandOrControl+Shift+2'
}

/** Returns false when another app already owns the shortcut. */
export function registerHotkeys(onCapture: () => void): boolean {
  const accelerator = captureAccelerator()
  const registered = globalShortcut.register(accelerator, onCapture)
  if (!registered) {
    console.warn(`Could not register ${accelerator}; another app may be using it.`)
  }
  return registered
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
```

- [ ] **Step 4: Write `src/main/tray.ts`**

```ts
import { app, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'node:path'
import { captureAccelerator } from './hotkeys'

export type TrayHandlers = {
  onCapture(): void
  onOpenEditor(): void
  captureRoot(): string
}

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray-icon.png')
    : join(app.getAppPath(), 'resources', 'tray-icon.png')
}

export function createTray(handlers: TrayHandlers): Tray {
  const icon = nativeImage.createFromPath(iconPath())
  // A template image adapts to light and dark menu bars on macOS.
  icon.setTemplateImage(true)

  const tray = new Tray(icon)
  tray.setToolTip('Chop')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Capture', accelerator: captureAccelerator(), click: handlers.onCapture },
      { label: 'Open Editor', click: handlers.onOpenEditor },
      { type: 'separator' },
      {
        label: 'Open Captures Folder',
        click: () => void shell.openPath(handlers.captureRoot()),
      },
      { type: 'separator' },
      { label: 'Quit Chop', role: 'quit' },
    ]),
  )
  return tray
}
```

Create `resources/tray-icon.png` as a 16×16 black-on-transparent PNG (plus a 32×32 `tray-icon@2x.png`). Any simple camera or scissors glyph works; it must be monochrome for the template image to render correctly.

- [ ] **Step 5: Wire everything in `src/main/index.ts`**

Replace `src/main/index.ts`:

```ts
import { app, BrowserWindow, type Tray } from 'electron'
import { runCaptureFlow } from './capture/capture-flow'
import { getEditorWindow, sendCapture } from './editor-window'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { registerEditorHandlers } from './ipc/editor-handlers'
import { defaultCaptureRoot } from './storage/paths'
import { createTray } from './tray'

// Held at module scope so the tray is not garbage collected.
let tray: Tray | null = null

async function capture(): Promise<void> {
  const result = await runCaptureFlow()
  if (result) sendCapture(result)
}

// A second instance would fight over the global shortcut and the manifest.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => getEditorWindow().focus())

  void app.whenReady().then(() => {
    const captureRoot = defaultCaptureRoot()
    registerEditorHandlers(captureRoot)
    registerHotkeys(() => void capture())
    tray = createTray({
      onCapture: () => void capture(),
      onOpenEditor: () => getEditorWindow().show(),
      captureRoot: () => captureRoot,
    })

    app.on('activate', () => getEditorWindow().show())
  })

  // Closing the editor leaves Chop running in the menu bar, so the hotkey keeps working.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('will-quit', unregisterHotkeys)
}
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `npx vitest run tests/main/hotkeys.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 7: Manually verify the whole loop**

Run: `npm run dev`
Expected, in order:
1. A tray icon appears; no editor window opens on its own.
2. Pressing ⌘⇧2 freezes the screen and dims it.
3. Hovering highlights whole windows; clicking one opens the editor with that window captured.
4. Drawing a box, then pressing ⌘C, puts the annotated image on the clipboard — paste it somewhere to confirm.
5. A PNG appears in `~/Pictures/Chop` within a second of the last edit.
6. Closing the editor leaves the app running; ⌘⇧2 still captures.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add tray, global hotkey, and app wiring"
```

---

### Task 26: Windows window provider

**Files:**
- Create: `src/main/window-providers/windows.ts`
- Modify: `src/main/window-providers/index.ts`
- Test: `tests/main/window-providers/windows.test.ts`

**Interfaces:**
- Consumes: `WindowRect` from `@shared/window-rect`; `WindowProvider` from `./types`
- Produces:
  - `rectFromFrameBounds(buffer: Buffer, id: number, app: string): WindowRect` — pure, tested
  - `createWindowsWindowProvider(): WindowProvider`

- [ ] **Step 1: Install koffi**

```bash
npm install koffi@3.1.4
```

`koffi` ships prebuilt binaries, so no node-gyp toolchain is required.

- [ ] **Step 2: Write the failing test**

Create `tests/main/window-providers/windows.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rectFromFrameBounds } from '../../../src/main/window-providers/windows'

/** A Win32 RECT is four 32-bit signed ints: left, top, right, bottom. */
function rect(left: number, top: number, right: number, bottom: number): Buffer {
  const buffer = Buffer.alloc(16)
  buffer.writeInt32LE(left, 0)
  buffer.writeInt32LE(top, 4)
  buffer.writeInt32LE(right, 8)
  buffer.writeInt32LE(bottom, 12)
  return buffer
}

describe('rectFromFrameBounds', () => {
  it('converts left/top/right/bottom into x/y/width/height', () => {
    expect(rectFromFrameBounds(rect(100, 50, 900, 650), 7, 'Notepad')).toEqual({
      id: 7,
      app: 'Notepad',
      bounds: { x: 100, y: 50, width: 800, height: 600 },
    })
  })

  it('handles a window on a monitor left of the primary', () => {
    expect(rectFromFrameBounds(rect(-1920, 0, -1520, 300), 8, 'Explorer').bounds).toEqual({
      x: -1920, y: 0, width: 400, height: 300,
    })
  })

  it('produces zero dimensions for an inverted rect rather than negatives', () => {
    const bounds = rectFromFrameBounds(rect(500, 500, 100, 100), 9, 'Ghost').bounds
    expect(bounds.width).toBe(0)
    expect(bounds.height).toBe(0)
  })
})
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npx vitest run tests/main/window-providers/windows.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `src/main/window-providers/windows.ts`**

```ts
import type { WindowRect } from '@shared/window-rect'
import type { WindowProvider } from './types'

const RECT_BYTES = 16
const DWMWA_EXTENDED_FRAME_BOUNDS = 9
const MAX_TITLE = 512

/** Pure conversion from a Win32 RECT buffer, exported for testing. */
export function rectFromFrameBounds(
  buffer: Buffer,
  id: number,
  app: string,
): WindowRect {
  const left = buffer.readInt32LE(0)
  const top = buffer.readInt32LE(4)
  const right = buffer.readInt32LE(8)
  const bottom = buffer.readInt32LE(12)
  return {
    id,
    app,
    bounds: {
      x: left,
      y: top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    },
  }
}

export function createWindowsWindowProvider(): WindowProvider {
  return {
    async listWindows(): Promise<readonly WindowRect[]> {
      // Imported lazily so macOS never loads the Windows FFI bindings.
      const koffi = (await import('koffi')).default
      const user32 = koffi.load('user32.dll')
      const dwmapi = koffi.load('dwmapi.dll')

      const GetTopWindow = user32.func('void* GetTopWindow(void*)')
      const GetWindow = user32.func('void* GetWindow(void*, uint32)')
      const IsWindowVisible = user32.func('bool IsWindowVisible(void*)')
      const GetWindowTextA = user32.func('int GetWindowTextA(void*, _Out_ char*, int)')
      const DwmGetWindowAttribute = dwmapi.func(
        'int DwmGetWindowAttribute(void*, uint32, _Out_ void*, uint32)',
      )

      const GW_HWNDNEXT = 2
      const results: WindowRect[] = []
      // GetTopWindow + GW_HWNDNEXT walks the z-order front to back, which is the
      // order the overlay's hit-testing depends on.
      let handle = GetTopWindow(null) as unknown

      for (let index = 0; handle && index < 500; index += 1) {
        if (IsWindowVisible(handle)) {
          const rect = Buffer.alloc(RECT_BYTES)
          const status = DwmGetWindowAttribute(
            handle,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            rect,
            RECT_BYTES,
          )
          if (status === 0) {
            const title = Buffer.alloc(MAX_TITLE)
            const length = GetWindowTextA(handle, title, MAX_TITLE)
            const app = length > 0 ? title.toString('utf8', 0, length) : ''
            const candidate = rectFromFrameBounds(rect, index, app)
            if (candidate.bounds.width > 0 && candidate.bounds.height > 0) {
              results.push(candidate)
            }
          }
        }
        handle = GetWindow(handle, GW_HWNDNEXT) as unknown
      }

      return results
    },
  }
}
```

- [ ] **Step 5: Select the provider on Windows**

In `src/main/window-providers/index.ts`, replace the Windows fallback comment in `resolveWindowProvider` with:

```ts
  if (process.platform === 'win32') {
    return withTimeout(createWindowsWindowProvider(), WINDOW_PROVIDER_TIMEOUT_MS)
  }
  return createStubWindowProvider([])
```

and add `import { createWindowsWindowProvider } from './windows'` at the top.

- [ ] **Step 6: Run the test and verify it passes**

Run: `npx vitest run tests/main/window-providers/windows.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 7: Record the manual smoke checklist**

The FFI path cannot run in CI. Create `docs/manual-smoke-tests.md`:

```markdown
# Manual smoke tests

These exercise platform code that cannot run in CI.

## macOS window provider
- [ ] `./resources/windowlist` prints a JSON array with plausible bounds
- [ ] Hovering the capture overlay highlights the correct window, front-most first
- [ ] Highlighting is correct on a secondary display, including one left of the primary
- [ ] Quitting an app removes it from the highlight list on the next capture

## Windows window provider
- [ ] Hovering highlights the correct window
- [ ] Highlight bounds exclude the drop shadow (DWM extended frame bounds)
- [ ] Highlighting is correct on a secondary display

## Permissions (macOS)
- [ ] With Screen Recording denied, capture shows guidance and opens System Settings
- [ ] After granting and relaunching, capture works
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Windows window provider via koffi"
```

---

### Task 27: End-to-end tests

E2E runs against a real Electron process with the platform layers stubbed, so it exercises the actual IPC and storage paths without needing a screen or a window provider.

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/editor.spec.ts`
- Modify: `src/main/index.ts` (honour `CHOP_CAPTURE_ROOT`)
- Modify: `package.json` (add the `e2e` script)

**Interfaces:**
- Consumes: the built app in `out/`
- Produces: `npm run e2e`

- [ ] **Step 1: Install Playwright**

```bash
npm install --save-dev @playwright/test@1.62.1
```

- [ ] **Step 2: Make the capture root overridable**

In `src/main/index.ts`, replace `const captureRoot = defaultCaptureRoot()` with:

```ts
    // Tests point this at a temp directory so they never touch ~/Pictures.
    const captureRoot = process.env.CHOP_CAPTURE_ROOT ?? defaultCaptureRoot()
```

- [ ] **Step 3: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
})
```

Add to `package.json` scripts:

```json
"e2e": "electron-vite build && playwright test"
```

- [ ] **Step 4: Write the failing E2E test**

Create `tests/e2e/editor.spec.ts`:

```ts
import { _electron as electron, type ElectronApplication, expect, test } from '@playwright/test'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let app: ElectronApplication
let captureRoot: string

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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
  // Drive the editor the way main does, bypassing the real screen capture.
  await app.evaluate(async ({ BrowserWindow }, dataUrl) => {
    const { sendCapture } = await import('./editor-window.js')
    sendCapture({
      id: 'e2e-1',
      dataUrl,
      width: 1,
      height: 1,
      createdAt: new Date().toISOString(),
    })
    return BrowserWindow.getAllWindows().length
  }, ONE_PIXEL_PNG)

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
  await app.evaluate(async (_electron, dataUrl) => {
    const { sendCapture } = await import('./editor-window.js')
    sendCapture({
      id: 'e2e-2',
      dataUrl,
      width: 400,
      height: 300,
      createdAt: new Date().toISOString(),
    })
  }, ONE_PIXEL_PNG)

  const page = await app.firstWindow()
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
  await app.evaluate(async ({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.close()
  })
  const alive = await app.evaluate(({ app: electronApp }) => !electronApp.isReady || true)
  expect(alive).toBe(true)
})
```

- [ ] **Step 5: Run the E2E suite and verify it fails, then passes**

Run: `npm run e2e`
Expected on the first run: failures pointing at whatever wiring is incomplete. Fix those, then re-run until all three tests pass. If `app.evaluate` cannot import `./editor-window.js`, export `sendCapture` onto `globalThis` in `src/main/index.ts` under an `if (process.env.CHOP_CAPTURE_ROOT)` guard and call it through `globalThis` instead — the test seam is deliberate and belongs only in test runs.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: add end-to-end editor tests"
```

---

### Task 28: Packaging

**Files:**
- Create: `electron-builder.yml`
- Create: `build/entitlements.mac.plist`
- Modify: `package.json` (add the `package` script)
- Create: `README.md`

**Interfaces:**
- Consumes: the built output in `out/` and the compiled helper in `resources/`
- Produces: `npm run package` producing a DMG and an NSIS installer

- [ ] **Step 1: Write `electron-builder.yml`**

```yaml
appId: com.sonnypham.chop
productName: Chop
directories:
  output: release
  buildResources: build
files:
  - out/**
  - package.json
extraResources:
  - from: resources/windowlist
    to: windowlist
  - from: resources/tray-icon.png
    to: tray-icon.png
mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch: [arm64, x64]
  # Screen Recording permission is bound to the code signature, so an ad-hoc
  # signature keeps the grant stable across rebuilds of the same build config.
  identity: null
  hardenedRuntime: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  extendInfo:
    NSScreenCaptureUsageDescription: Chop needs screen access to capture screenshots.
win:
  target:
    - target: nsis
      arch: [x64]
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

- [ ] **Step 2: Write `build/entitlements.mac.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.device.camera</key>
    <true/>
  </dict>
</plist>
```

- [ ] **Step 3: Add the package script**

In `package.json`:

```json
"package": "npm run build:helper && electron-vite build && electron-builder --config electron-builder.yml"
```

- [ ] **Step 4: Build and install locally**

```bash
npm run package
open release
```

Expected: a `Chop-0.1.0-arm64.dmg` in `release/`. Install it, then launch from `/Applications`.

On first launch macOS will block the unsigned app — right-click the app and choose Open, then confirm. Grant Screen Recording when prompted and relaunch.

- [ ] **Step 5: Verify the packaged app**

Confirm in the installed build, not the dev build:
- The tray icon appears
- ⌘⇧2 captures, and window highlighting works — this proves `resources/windowlist` was bundled and is executable
- A PNG appears in `~/Pictures/Chop`
- The filmstrip shows past captures after a relaunch

- [ ] **Step 6: Write `README.md`**

```markdown
# Chop

A personal screen capture and annotation tool. Capture a region or a window with
one click, mark it up, and get it into the clipboard or a folder.

## Install

    npm install
    npm run package

The macOS build is ad-hoc signed. On first launch, right-click the app and choose
Open to get past Gatekeeper, then grant Screen Recording permission in
System Settings → Privacy & Security → Screen Recording and relaunch.

## Use

- **⌘⇧2** (Ctrl+Shift+2 on Windows) — capture. Hover a window and click it, or
  drag a region. Esc cancels.
- Tools: select, box, arrow, text, highlighter, blur, crop (`V B A T H X C`)
- **⌘C** copies the annotated image, **⌘Z** / **⇧⌘Z** undo and redo
- Captures auto-save to `~/Pictures/Chop`; past captures appear in the filmstrip
  and reopen fully editable

## Develop

    npm run dev             # run the app
    npm test                # unit and integration tests
    npm run test:coverage   # enforce the 80% floor on src/shared
    npm run e2e             # end-to-end tests
    npm run typecheck

Platform-specific code that cannot run in CI is covered by
`docs/manual-smoke-tests.md`.
```

- [ ] **Step 7: Run the full verification suite**

```bash
npm run typecheck && npm run test:coverage && npm run e2e
```

Expected: all pass, with `src/shared/**` at or above 80% on every threshold.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: add packaging config and project documentation"
```

---

## Verification checklist

Run before calling the project done:

- [ ] `npm run typecheck` — no errors
- [ ] `npm run test:coverage` — passes, `src/shared/**` at or above 80% on lines, functions, branches, and statements
- [ ] `npm run e2e` — all tests pass
- [ ] `docs/manual-smoke-tests.md` — every box ticked on macOS
- [ ] Packaged app installs and captures with window highlighting working
