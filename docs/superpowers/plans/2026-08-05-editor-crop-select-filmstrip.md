# Editor Crop Session, Select Removal & Filmstrip Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Select tool and annotation selection, replace drag-rect crop with a full-image handle crop session that commits on mouseup, and give filmstrip thumbs a fixed width.

**Architecture:** Drop `select` / `selectedId` from shared editor state and renderer wiring. Add a `cropSession` working rect on `EditorState` (not history). While Crop is active, the canvas paints the full source image with dim overlay + handles; mouseup commits via existing `setCrop` / `commitDocument`. Filmstrip width is a CSS-only change.

**Tech Stack:** TypeScript, Vitest, Electron editor (`src/renderer/editor/*`), shared geometry/hit-test (`src/shared/*`).

## Global Constraints

- Annotations are immutable after place — no select / move / resize / Delete-selected (spec).
- Default tool is `box`.
- Crop applies on **mouseup** after a handle resize or frame move; no Enter/Confirm.
- Crop remains non-destructive (`CaptureDocument.cropRect`).
- In-progress crop chrome must never appear in `renderTo` / Copy / autosave.
- Filmstrip: fixed width, `height: auto` (aspect preserved).
- Coverage floor on `src/shared/**` stays ≥ 80% (lines, functions, branches, statements).

## File Structure

| File | Responsibility |
|------|----------------|
| `src/shared/tools.ts` | Drop `select` from `ToolId`; remove `cropDraftRect` |
| `src/shared/editor-state.ts` | Default `box`; remove selection; add `cropSession` |
| `src/shared/hit-test.ts` | Edge handles (`n`/`e`/`s`/`w`) + edge `resizeRect` |
| `src/shared/crop-session.ts` | Pure helpers: initial rect, clamp/constrain, move |
| `src/renderer/editor/toolbar.ts` | Remove Select button |
| `src/renderer/editor/main.ts` | Shortcuts / Delete / Escape cleanup |
| `src/renderer/editor/interactions.ts` | Crop session gestures; drop select/move/resize |
| `src/renderer/editor/canvas-view.ts` | Full-image crop chrome; drop selection chrome |
| `src/renderer/editor/index.html` | Filmstrip fixed width |
| `tests/shared/*.test.ts` | Match the above |

---

### Task 1: Remove Select from shared tools + editor state

**Files:**
- Modify: `src/shared/tools.ts`
- Modify: `src/shared/editor-state.ts`
- Modify: `tests/shared/tools.test.ts`
- Modify: `tests/shared/editor-state.test.ts`

**Interfaces:**
- Consumes: existing `createDocument`, history helpers
- Produces:
  - `ToolId = 'box' | 'arrow' | 'text' | 'highlight' | 'blur' | 'crop'` (no `select`)
  - `createEditorState` defaults `tool: 'box'`
  - No `selectedId`, `selectAnnotation`, or `deleteSelected`

- [ ] **Step 1: Update failing/expectation tests for tools**

In `tests/shared/tools.test.ts`:

- Remove the `draftToAnnotation(drag('select'), …)` assertion.
- Change the non-drawing tools list to `['text', 'crop']` only.

```ts
  it('returns null for tools that do not produce annotations', () => {
    expect(draftToAnnotation(drag('crop'), style, 'a6')).toBeNull()
    expect(draftToAnnotation(drag('text'), style, 'a8')).toBeNull()
  })

  it('excludes text and crop', () => {
    const other: readonly ToolId[] = ['text', 'crop']
    expect(other.some(isDrawingTool)).toBe(false)
  })
```

Leave `cropDraftRect` tests in place for now (removed in Task 5).

- [ ] **Step 2: Rewrite editor-state tests without selection**

Replace `tests/shared/editor-state.test.ts` contents with:

```ts
import { describe, expect, it } from 'vitest'
import { addAnnotation, type Annotation, createDocument } from '@shared/document'
import {
  commitDocument,
  createEditorState,
  currentDocument,
  previewDocument,
  setDraft,
  setStyle,
  setTool,
  undoState,
  redoState,
} from '@shared/editor-state'
import { beginDraft } from '@shared/tools'

const box: Annotation = {
  id: 'b1', kind: 'box',
  rect: { x: 0, y: 0, width: 10, height: 10 },
  color: '#f00', strokeWidth: 3,
}

const base = createDocument('d', 800, 600)

describe('createEditorState', () => {
  it('starts on the box tool with no draft', () => {
    const state = createEditorState(base)
    expect(state.tool).toBe('box')
    expect(state.draft).toBeNull()
    expect(currentDocument(state)).toEqual(base)
  })
})

describe('setTool', () => {
  it('switches the active tool and clears the draft', () => {
    const drafted = setDraft(createEditorState(base), beginDraft('box', { x: 1, y: 1 }))
    const next = setTool(drafted, 'arrow')
    expect(next.tool).toBe('arrow')
    expect(next.draft).toBeNull()
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

describe('undoState / redoState', () => {
  it('round-trips a commit', () => {
    const state = commitDocument(createEditorState(base), addAnnotation(base, box))
    expect(currentDocument(redoState(undoState(state)))).toEqual(currentDocument(state))
  })

  it('clears the draft on undo', () => {
    const drafted = setDraft(
      commitDocument(createEditorState(base), addAnnotation(base, box)),
      beginDraft('box', { x: 1, y: 1 }),
    )
    expect(undoState(drafted).draft).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/shared/tools.test.ts tests/shared/editor-state.test.ts`

Expected: FAIL — `select` still in types / default tool still `select` / selection APIs still exported.

- [ ] **Step 4: Implement shared removals**

In `src/shared/tools.ts`:

```ts
export type ToolId = 'box' | 'arrow' | 'text' | 'highlight' | 'blur' | 'crop'
```

Update the `draftToAnnotation` comment to drop “select”.

In `src/shared/editor-state.ts`, replace with:

```ts
import { type CaptureDocument } from './document'
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
  readonly draft: Draft | null
  /** Working crop frame while Crop is active; null otherwise. */
  readonly cropSession: { readonly rect: import('./geometry').Rect } | null
}

export function createEditorState(doc: CaptureDocument): EditorState {
  return {
    history: createHistory(doc),
    tool: 'box',
    style: defaultStyle(),
    draft: null,
    cropSession: null,
  }
}

export function currentDocument(state: EditorState): CaptureDocument {
  return state.history.present
}

export function setTool(state: EditorState, tool: ToolId): EditorState {
  return {
    ...state,
    tool,
    draft: null,
    // Crop session is started in Task 4 via setTool + begin helpers.
    // For now clear it when leaving crop; Task 4 will initialize on enter.
    cropSession: tool === 'crop' ? state.cropSession : null,
  }
}

export function setStyle(state: EditorState, patch: Partial<ToolStyle>): EditorState {
  return { ...state, style: { ...state.style, ...patch } }
}

export function setDraft(state: EditorState, draft: Draft | null): EditorState {
  return { ...state, draft }
}

export function commitDocument(state: EditorState, doc: CaptureDocument): EditorState {
  return { ...state, history: pushHistory(state.history, doc), draft: null }
}

export function previewDocument(state: EditorState, doc: CaptureDocument): EditorState {
  return { ...state, history: { ...state.history, present: doc } }
}

export function undoState(state: EditorState): EditorState {
  return { ...state, history: undo(state.history), draft: null }
}

export function redoState(state: EditorState): EditorState {
  return { ...state, history: redo(state.history), draft: null }
}
```

Use a proper `Rect` import instead of the inline `import('./geometry').Rect` above:

```ts
import type { Rect } from './geometry'
// ...
readonly cropSession: { readonly rect: Rect } | null
```

Delete `selectAnnotation` and `deleteSelected`. Remove `selectedId` entirely.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/shared/tools.test.ts tests/shared/editor-state.test.ts`

Expected: PASS (other packages may still fail typecheck until Task 2).

- [ ] **Step 6: Commit**

```bash
git add src/shared/tools.ts src/shared/editor-state.ts tests/shared/tools.test.ts tests/shared/editor-state.test.ts
git commit -m "$(cat <<'EOF'
refactor: remove select tool from shared editor state

EOF
)"
```

---

### Task 2: Strip Select from the editor UI and gestures

**Files:**
- Modify: `src/renderer/editor/toolbar.ts`
- Modify: `src/renderer/editor/main.ts`
- Modify: `src/renderer/editor/interactions.ts`
- Modify: `src/renderer/editor/canvas-view.ts`

**Interfaces:**
- Consumes: `ToolId` without `select`; `EditorState` without `selectedId`
- Produces: toolbar starting at Box; interactions only for text / drawing / (legacy crop until Task 5)

- [ ] **Step 1: Remove Select from the toolbar**

In `src/renderer/editor/toolbar.ts`, change `TOOLS` to:

```ts
const TOOLS: readonly { readonly id: ToolId; readonly label: string; readonly key: string }[] = [
  { id: 'box', label: 'Box', key: 'B' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'highlight', label: 'Highlight', key: 'H' },
  { id: 'blur', label: 'Blur', key: 'X' },
  { id: 'crop', label: 'Crop', key: 'C' },
]
```

- [ ] **Step 2: Clean `main.ts` shortcuts and selection handlers**

- Drop `deleteSelected` / `selectAnnotation` imports.
- Remove `v: 'select'` from `SHORTCUT_TOOLS`.
- Remove the `Delete` / `Backspace` selected-annotation block.
- Remove the `Escape` → `selectAnnotation` block (or no-op delete the whole Escape branch).

- [ ] **Step 3: Simplify `interactions.ts`**

Remove:

- `selectAnnotation` import and `startSelectGesture`
- `move` / `resize` gesture modes and their mousemove/mouseup branches
- `withRect`, `moveAnnotation` / `handleAtPoint` / `annotationAtPoint` / `annotationBounds` / `resizeRect` usage used only for select
- The `if (state.tool === 'select')` branch

Keep draw + existing crop draft path temporarily (Task 5 replaces crop).

`previewDocument` import can go if unused after this step.

- [ ] **Step 4: Remove selection chrome from `canvas-view.ts`**

Delete `drawSelection` and its call in `render`. Remove unused `annotationBounds` / `handleRects` imports if nothing else needs them yet (crop chrome in Task 5 will re-import `handleRects`).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`

Expected: PASS (no remaining `select` / `selectedId` references in `src/`).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/editor/toolbar.ts src/renderer/editor/main.ts src/renderer/editor/interactions.ts src/renderer/editor/canvas-view.ts
git commit -m "$(cat <<'EOF'
refactor: remove select tool from editor UI and gestures

EOF
)"
```

---

### Task 3: Edge handles + crop constraint helpers

**Files:**
- Modify: `src/shared/hit-test.ts`
- Modify: `tests/shared/hit-test.test.ts`
- Create: `src/shared/crop-session.ts`
- Create: `tests/shared/crop-session.test.ts`

**Interfaces:**
- Consumes: `Rect`, `Point`, `normalizeRect`, `HANDLE_SIZE`, `MIN_SELECTION_DIMENSION`, `CaptureDocument`
- Produces:
  - `HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'`
  - `handleRects` / `handleAtPoint` / `resizeRect` support all eight
  - `fullImageRect(doc: CaptureDocument): Rect`
  - `initialCropRect(doc: CaptureDocument): Rect`
  - `constrainCropRect(rect: Rect, bounds: Rect): Rect`
  - `moveCropRect(rect: Rect, dx: number, dy: number, bounds: Rect): Rect`

- [ ] **Step 1: Extend hit-test tests for edge handles**

Append / update in `tests/shared/hit-test.test.ts`:

```ts
describe('handleRects', () => {
  it('exposes four corners and four edge midpoints', () => {
    const handles = handleRects({ x: 100, y: 100, width: 200, height: 100 })
    expect(handles.map((h) => h.id)).toEqual([
      'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w',
    ])
  })
})

describe('resizeRect', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 }

  it('resizes from the east edge keeping left anchored', () => {
    expect(resizeRect(rect, 'e', { x: 350, y: 150 })).toEqual({
      x: 100, y: 100, width: 250, height: 100,
    })
  })

  it('resizes from the north edge keeping bottom anchored', () => {
    expect(resizeRect(rect, 'n', { x: 200, y: 50 })).toEqual({
      x: 100, y: 50, width: 200, height: 150,
    })
  })
})
```

Update any existing test that asserts exactly four handle ids.

- [ ] **Step 2: Run hit-test to verify fail**

Run: `npx vitest run tests/shared/hit-test.test.ts`

Expected: FAIL — only four handles / edge resize missing.

- [ ] **Step 3: Implement eight-handle hit-test**

In `src/shared/hit-test.ts`:

```ts
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

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
  const midX = rect.x + rect.width / 2
  const midY = rect.y + rect.height / 2
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return [
    { id: 'nw', rect: at(rect.x, rect.y) },
    { id: 'n', rect: at(midX, rect.y) },
    { id: 'ne', rect: at(right, rect.y) },
    { id: 'e', rect: at(right, midY) },
    { id: 'se', rect: at(right, bottom) },
    { id: 's', rect: at(midX, bottom) },
    { id: 'sw', rect: at(rect.x, bottom) },
    { id: 'w', rect: at(rect.x, midY) },
  ]
}

export function resizeRect(rect: Rect, handle: HandleId, point: Point): Rect {
  const left = rect.x
  const top = rect.y
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  switch (handle) {
    case 'nw':
      return normalizeRect(point, { x: right, y: bottom })
    case 'n':
      return normalizeRect({ x: left, y: point.y }, { x: right, y: bottom })
    case 'ne':
      return normalizeRect({ x: left, y: bottom }, point)
    case 'e':
      return normalizeRect({ x: left, y: top }, { x: point.x, y: bottom })
    case 'se':
      return normalizeRect({ x: left, y: top }, point)
    case 's':
      return normalizeRect({ x: left, y: top }, { x: right, y: point.y })
    case 'sw':
      return normalizeRect({ x: right, y: top }, point)
    case 'w':
      return normalizeRect({ x: point.x, y: top }, { x: right, y: bottom })
  }
}
```

Keep `handleAtPoint` unchanged (it already uses `handleRects`).

- [ ] **Step 4: Write crop-session helper tests**

Create `tests/shared/crop-session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createDocument, setCrop } from '@shared/document'
import {
  constrainCropRect,
  fullImageRect,
  initialCropRect,
  moveCropRect,
} from '@shared/crop-session'

const doc = createDocument('d', 800, 600)
const bounds = { x: 0, y: 0, width: 800, height: 600 }

describe('fullImageRect / initialCropRect', () => {
  it('uses the full document when there is no crop', () => {
    expect(fullImageRect(doc)).toEqual(bounds)
    expect(initialCropRect(doc)).toEqual(bounds)
  })

  it('starts from the committed crop when present', () => {
    const cropped = setCrop(doc, { x: 10, y: 20, width: 100, height: 80 })
    expect(initialCropRect(cropped)).toEqual({ x: 10, y: 20, width: 100, height: 80 })
    expect(fullImageRect(cropped)).toEqual(bounds)
  })
})

describe('constrainCropRect', () => {
  it('clamps to bounds and enforces the minimum size', () => {
    expect(constrainCropRect({ x: -10, y: -10, width: 50, height: 50 }, bounds)).toEqual({
      x: 0, y: 0, width: 50, height: 50,
    })
    expect(constrainCropRect({ x: 0, y: 0, width: 1, height: 1 }, bounds)).toEqual({
      x: 0, y: 0, width: 4, height: 4,
    })
  })

  it('keeps a oversized rect inside the image', () => {
    expect(constrainCropRect({ x: 700, y: 500, width: 200, height: 200 }, bounds)).toEqual({
      x: 600, y: 400, width: 200, height: 200,
    })
  })
})

describe('moveCropRect', () => {
  it('offsets then clamps so the frame stays inside the image', () => {
    const rect = { x: 10, y: 10, width: 100, height: 80 }
    expect(moveCropRect(rect, -50, -50, bounds)).toEqual({
      x: 0, y: 0, width: 100, height: 80,
    })
    expect(moveCropRect(rect, 1000, 1000, bounds)).toEqual({
      x: 700, y: 520, width: 100, height: 80,
    })
  })
})
```

(Minimum size `4` matches `MIN_SELECTION_DIMENSION`.)

- [ ] **Step 5: Run crop-session tests to verify fail**

Run: `npx vitest run tests/shared/crop-session.test.ts`

Expected: FAIL — module missing.

- [ ] **Step 6: Implement `crop-session.ts`**

Create `src/shared/crop-session.ts`:

```ts
import { MIN_SELECTION_DIMENSION } from './constants'
import type { CaptureDocument } from './document'
import type { Rect } from './geometry'

export function fullImageRect(doc: CaptureDocument): Rect {
  return { x: 0, y: 0, width: doc.width, height: doc.height }
}

export function initialCropRect(doc: CaptureDocument): Rect {
  return doc.cropRect ?? fullImageRect(doc)
}

/** Clamp into bounds and enforce MIN_SELECTION_DIMENSION on both edges. */
export function constrainCropRect(rect: Rect, bounds: Rect): Rect {
  const min = MIN_SELECTION_DIMENSION
  const width = Math.min(Math.max(rect.width, min), bounds.width)
  const height = Math.min(Math.max(rect.height, min), bounds.height)
  const maxX = bounds.x + bounds.width - width
  const maxY = bounds.y + bounds.height - height
  return {
    x: Math.min(Math.max(rect.x, bounds.x), maxX),
    y: Math.min(Math.max(rect.y, bounds.y), maxY),
    width,
    height,
  }
}

export function moveCropRect(rect: Rect, dx: number, dy: number, bounds: Rect): Rect {
  return constrainCropRect(
    { ...rect, x: rect.x + dx, y: rect.y + dy },
    bounds,
  )
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/shared/hit-test.test.ts tests/shared/crop-session.test.ts`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/shared/hit-test.ts src/shared/crop-session.ts tests/shared/hit-test.test.ts tests/shared/crop-session.test.ts
git commit -m "$(cat <<'EOF'
feat: add edge crop handles and crop constraint helpers

EOF
)"
```

---

### Task 4: Wire `cropSession` into editor state

**Files:**
- Modify: `src/shared/editor-state.ts`
- Modify: `tests/shared/editor-state.test.ts`

**Interfaces:**
- Consumes: `initialCropRect` from `@shared/crop-session`
- Produces:
  - `setTool` initializes `cropSession` when entering crop
  - `setCropSession(state, rect: Rect | null): EditorState`
  - `commitCrop(state): EditorState` — `commitDocument(setCrop(…))` and keeps session on the committed rect

- [ ] **Step 1: Add crop-session tests**

Append to `tests/shared/editor-state.test.ts`:

```ts
import { setCrop } from '@shared/document'
import { commitCrop, setCropSession } from '@shared/editor-state'

describe('crop session', () => {
  it('starts a full-image session when entering crop with no cropRect', () => {
    const state = setTool(createEditorState(base), 'crop')
    expect(state.cropSession?.rect).toEqual({ x: 0, y: 0, width: 800, height: 600 })
  })

  it('starts from the committed cropRect when present', () => {
    const cropped = commitDocument(
      createEditorState(base),
      setCrop(base, { x: 10, y: 20, width: 100, height: 80 }),
    )
    expect(setTool(cropped, 'crop').cropSession?.rect).toEqual({
      x: 10, y: 20, width: 100, height: 80,
    })
  })

  it('clears the session when leaving crop', () => {
    const cropping = setTool(createEditorState(base), 'crop')
    expect(setTool(cropping, 'box').cropSession).toBeNull()
  })

  it('updates the working rect without touching history', () => {
    const cropping = setTool(createEditorState(base), 'crop')
    const next = setCropSession(cropping, { x: 5, y: 5, width: 50, height: 40 })
    expect(next.cropSession?.rect).toEqual({ x: 5, y: 5, width: 50, height: 40 })
    expect(next.history.past).toHaveLength(0)
    expect(currentDocument(next).cropRect).toBeNull()
  })

  it('commitCrop writes cropRect and keeps the session on that rect', () => {
    const cropping = setCropSession(
      setTool(createEditorState(base), 'crop'),
      { x: 5, y: 5, width: 50, height: 40 },
    )
    const committed = commitCrop(cropping)
    expect(currentDocument(committed).cropRect).toEqual({
      x: 5, y: 5, width: 50, height: 40,
    })
    expect(committed.cropSession?.rect).toEqual({
      x: 5, y: 5, width: 50, height: 40,
    })
    expect(currentDocument(undoState(committed)).cropRect).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npx vitest run tests/shared/editor-state.test.ts`

Expected: FAIL — `setCropSession` / `commitCrop` missing; `setTool` does not init session.

- [ ] **Step 3: Implement session helpers**

In `src/shared/editor-state.ts`:

```ts
import { setCrop } from './document'
import { initialCropRect } from './crop-session'
import type { Rect } from './geometry'

export function setTool(state: EditorState, tool: ToolId): EditorState {
  if (tool === 'crop') {
    return {
      ...state,
      tool,
      draft: null,
      cropSession: { rect: initialCropRect(currentDocument(state)) },
    }
  }
  return { ...state, tool, draft: null, cropSession: null }
}

export function setCropSession(state: EditorState, rect: Rect | null): EditorState {
  return {
    ...state,
    cropSession: rect ? { rect } : null,
  }
}

export function commitCrop(state: EditorState): EditorState {
  if (!state.cropSession) return state
  const rect = state.cropSession.rect
  return {
    ...commitDocument(state, setCrop(currentDocument(state), rect)),
    cropSession: { rect },
    tool: 'crop',
  }
}
```

Also clear `cropSession` in `undoState` / `redoState` **or** re-sync: simplest is set `cropSession: null` and let the user re-enter Crop (matches “switching away clears”). Prefer:

```ts
export function undoState(state: EditorState): EditorState {
  return { ...state, history: undo(state.history), draft: null, cropSession: null, tool: state.tool === 'crop' ? 'box' : state.tool }
}
```

That is surprising. Better: on undo/redo while in crop, refresh session from the new present:

```ts
export function undoState(state: EditorState): EditorState {
  const history = undo(state.history)
  const next = { ...state, history, draft: null }
  if (next.tool !== 'crop') return { ...next, cropSession: null }
  return { ...next, cropSession: { rect: initialCropRect(history.present) } }
}
```

Same for `redoState`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/shared/editor-state.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/editor-state.ts tests/shared/editor-state.test.ts
git commit -m "$(cat <<'EOF'
feat: add cropSession state and commitCrop

EOF
)"
```

---

### Task 5: Crop gestures + full-image canvas chrome

**Files:**
- Modify: `src/renderer/editor/interactions.ts`
- Modify: `src/renderer/editor/canvas-view.ts`
- Modify: `src/shared/tools.ts` (remove `cropDraftRect`)
- Modify: `tests/shared/tools.test.ts` (remove `cropDraftRect` tests)

**Interfaces:**
- Consumes: `setCropSession`, `commitCrop`, `constrainCropRect`, `moveCropRect`, `fullImageRect`, `handleAtPoint`, `resizeRect`, `rectContains`
- Produces: crop tool shows full image + dim + handles; mouseup commits

- [ ] **Step 1: Replace crop interaction path**

In `src/renderer/editor/interactions.ts`, use this gesture model:

```ts
type Gesture =
  | { readonly mode: 'draw' }
  | {
      readonly mode: 'crop-resize'
      readonly handle: HandleId
    }
  | {
      readonly mode: 'crop-move'
      readonly last: Point
    }
```

On mousedown when `tool === 'crop'` and `state.cropSession`:

1. If `handleAtPoint(session.rect, point)` → `crop-resize`
2. Else if `rectContains(session.rect, point)` → `crop-move`
3. Else ignore

On mousemove:

- `crop-resize`: `setCropSession(state, constrainCropRect(resizeRect(session.rect, handle, point), fullImageRect(doc)))`
- `crop-move`: `setCropSession(state, moveCropRect(session.rect, dx, dy, fullImageRect(doc)))`; update `last`

On mouseup for either crop mode: `store.set(commitCrop(state))`

Remove the old draft-based crop (`beginDraft('crop')`, `crop` mode, `setCrop` via draft).

On `mouseleave` during crop gesture: cancel by restoring session from `initialCropRect(currentDocument(state))` (or simply `setCropSession(state, initialCropRect(...))`) and clear gesture — do **not** commit.

Imports to add from `@shared/editor-state`: `setCropSession`, `commitCrop`.  
From `@shared/crop-session`: `constrainCropRect`, `fullImageRect`, `moveCropRect`, `initialCropRect`.  
From `@shared/hit-test`: `handleAtPoint`, `resizeRect`.  
From `@shared/geometry`: `rectContains`.

- [ ] **Step 2: Paint crop session in `canvas-view.ts`**

Behavior while `state.tool === 'crop' && state.cropSession`:

1. Build `paintDoc = { ...currentDocument(state), cropRect: null }` so the full image is shown.
2. Use `outputSize(paintDoc)` / fit scale against the full image.
3. `renderDocument(ctx, image, paintDoc, …)`.
4. Dim outside the working rect:

```ts
function drawCropSession(ctx: CanvasRenderingContext2D, state: EditorState, scale: number): void {
  const session = state.cropSession
  if (state.tool !== 'crop' || !session) return
  const doc = currentDocument(state)
  const bounds = fullImageRect(doc)
  const { rect } = session

  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  // Four rectangles around the crop (top / left / right / bottom)
  ctx.fillRect(bounds.x, bounds.y, bounds.width, Math.max(0, rect.y - bounds.y))
  ctx.fillRect(bounds.x, rect.y + rect.height, bounds.width, Math.max(0, bounds.y + bounds.height - (rect.y + rect.height)))
  ctx.fillRect(bounds.x, rect.y, Math.max(0, rect.x - bounds.x), rect.height)
  ctx.fillRect(rect.x + rect.width, rect.y, Math.max(0, bounds.x + bounds.width - (rect.x + rect.width)), rect.height)

  ctx.strokeStyle = '#2f9bff'
  ctx.lineWidth = 1 / scale
  ctx.setLineDash([4 / scale, 3 / scale])
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
  ctx.setLineDash([])
  ctx.fillStyle = '#2f9bff'
  for (const handle of handleRects(rect)) {
    ctx.fillRect(
      handle.rect.x,
      handle.rect.y,
      handle.rect.width / scale,
      handle.rect.height / scale,
    )
  }
  ctx.restore()
}
```

5. `toImagePoint` while in crop session must pass `null` crop origin (full image coords):

```ts
toImagePoint(event, state) {
  const rect = canvas.getBoundingClientRect()
  const local = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  const cropOrigin =
    state.tool === 'crop' && state.cropSession
      ? null
      : currentDocument(state).cropRect
  return viewToImage(local, currentScale, cropOrigin)
}
```

6. Delete `drawCropDraft` / `cropDraftRect` usage.
7. `renderTo` unchanged — still `currentDocument(state)` only.

- [ ] **Step 3: Remove `cropDraftRect` from tools**

Delete `cropDraftRect` from `src/shared/tools.ts` and its tests in `tests/shared/tools.test.ts`. Keep `documentWithDraft` returning the same doc for crop drafts if `beginDraft('crop')` somehow happens; crop drafts are unused.

- [ ] **Step 4: Typecheck + unit tests**

Run:

```bash
npm run typecheck
npx vitest run tests/shared
```

Expected: PASS

- [ ] **Step 5: Manual smoke (if running the app)**

1. Capture → Crop → full image with dim + handles.
2. Drag a corner → live frame; mouseup → canvas shows cropped output.
3. Crop again → can enlarge back toward full image.
4. Undo restores previous crop.
5. Copy does not include handles/dim.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/editor/interactions.ts src/renderer/editor/canvas-view.ts src/shared/tools.ts tests/shared/tools.test.ts
git commit -m "$(cat <<'EOF'
feat: handle-based crop session with live preview

EOF
)"
```

---

### Task 6: Filmstrip fixed width

**Files:**
- Modify: `src/renderer/editor/index.html`

**Interfaces:**
- None (CSS only)

- [ ] **Step 1: Update filmstrip CSS**

In `src/renderer/editor/index.html`, replace `#filmstrip img` rules:

```css
#filmstrip {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 12px;
  overflow-x: auto;
  border-top: 1px solid rgba(128, 128, 128, 0.3);
  min-height: 76px;
}
#filmstrip img {
  width: 100px;
  height: auto;
  border-radius: 4px;
  cursor: pointer;
  border: 2px solid transparent;
  flex: 0 0 auto;
}
#filmstrip img.active { border-color: #2f9bff; }
```

`100px` matches a typical landscape thumb that was previously ~56px tall.

- [ ] **Step 2: Visual check**

Open the editor with mixed aspect captures; every thumb should share width 100px with varying heights.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/editor/index.html
git commit -m "$(cat <<'EOF'
style: give filmstrip thumbs a fixed width

EOF
)"
```

---

### Task 7: Final verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run full unit suite + typecheck**

```bash
npm run typecheck
npm test
```

Expected: all PASS.

- [ ] **Step 2: Optional e2e**

```bash
npm run e2e
```

Expected: existing editor e2e still PASS (Box draw / undo). No Select button assertions exist today.

- [ ] **Step 3: Commit any leftover test fixes only if needed**

If Step 1 required small test/type fixes, commit them:

```bash
git add -A
git commit -m "$(cat <<'EOF'
test: finish crop session and select-removal cleanup

EOF
)"
```

Otherwise skip.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Remove Select tool / `V` / selection / Delete-selected | 1, 2 |
| Default tool Box | 1 |
| Full-image crop session + handles + dim | 3, 4, 5 |
| Commit on mouseup | 5 (`commitCrop`) |
| Re-crop can enlarge | 5 (full image paint + session from `cropRect`) |
| Export without chrome | 5 (`renderTo` unchanged) |
| Filmstrip fixed width, auto height | 6 |
| Undo crop | 4 (`commitCrop` + history) |

## Placeholder / consistency check

- No TBD/TODO left in tasks.
- `HandleId` eight-value set is consistent across Task 3 and Task 5.
- `cropSession` / `setCropSession` / `commitCrop` names match Tasks 4–5.
- `cropDraftRect` removed in Task 5 after canvas stops using it.
