# Live Draft Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show live drawing-tool drafts (box, arrow, highlight, blur, crop) on top of the capture while the user drags, without affecting export/autosave.

**Architecture:** Add pure helpers in `@shared/tools` that turn a draft into a temporary top annotation (or a crop chrome rect). The editor canvas `render` path paints `documentWithDraft(currentDocument(state), state.draft, state.style)`; `renderTo` keeps using `currentDocument` only so drafts never export.

**Tech Stack:** TypeScript, Vitest (node), Electron editor canvas (`src/renderer/editor/canvas-view.ts`), shared render (`src/shared/render.ts`).

## Global Constraints

- Live outline only — no size labels, no resize handles during draft (spec non-goals).
- Draft id for paint-only annotations is `__draft__` and must never be committed into history.
- Degenerate drafts stay invisible (same rules as `draftToAnnotation` / `isDegenerateRect`).
- Crop draft chrome uses selection color `#2f9bff`, dashed stroke.
- Coverage floor on `src/shared/**` stays ≥ 80% (lines, functions, branches, statements).
- Do not change interaction / commit / undo semantics in `interactions.ts`.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/shared/tools.ts` | `documentWithDraft`, `cropDraftRect` helpers |
| `tests/shared/tools.test.ts` | Unit tests for those helpers |
| `tests/shared/render.test.ts` | Assert draft box is stroked when painted via `documentWithDraft` |
| `src/renderer/editor/canvas-view.ts` | Use helpers in on-screen `render`; leave `renderTo` draft-free |

---

### Task 1: Shared draft paint helpers

**Files:**
- Modify: `src/shared/tools.ts`
- Modify: `tests/shared/tools.test.ts`
- Modify: `tests/shared/render.test.ts`

**Interfaces:**
- Consumes: `draftToAnnotation`, `normalizeRect`, `isDegenerateRect`, `CaptureDocument` (import type from `./document`), `Draft`, `ToolStyle`
- Produces:
  - `documentWithDraft(doc: CaptureDocument, draft: Draft | null, style: ToolStyle): CaptureDocument`
  - `cropDraftRect(draft: Draft | null): Rect | null` (`Rect` from `./geometry`)

- [ ] **Step 1: Write the failing helper tests**

Append to `tests/shared/tools.test.ts`:

```ts
import { createDocument } from '@shared/document'
import { documentWithDraft, cropDraftRect } from '@shared/tools'

describe('documentWithDraft', () => {
  const doc = createDocument('d', 200, 100)

  it('appends a paint-only box annotation for a box draft', () => {
    const next = documentWithDraft(doc, drag('box'), style)
    expect(next.annotations).toHaveLength(1)
    expect(next.annotations[0]).toMatchObject({
      id: '__draft__',
      kind: 'box',
      rect: { x: 10, y: 10, width: 100, height: 80 },
    })
    expect(doc.annotations).toHaveLength(0)
  })

  it('returns the same document for null, degenerate, or crop drafts', () => {
    expect(documentWithDraft(doc, null, style)).toBe(doc)
    expect(documentWithDraft(doc, drag('box', 11, 11), style)).toBe(doc)
    expect(documentWithDraft(doc, drag('crop'), style)).toBe(doc)
  })

  it('keeps existing annotations under the draft', () => {
    const withBox = {
      ...doc,
      annotations: [
        {
          id: 'existing',
          kind: 'box' as const,
          rect: { x: 0, y: 0, width: 20, height: 20 },
          color: '#000000',
          strokeWidth: 2,
        },
      ],
    }
    const next = documentWithDraft(withBox, drag('arrow'), style)
    expect(next.annotations.map((a) => a.id)).toEqual(['existing', '__draft__'])
    expect(next.annotations[1]?.kind).toBe('arrow')
  })
})

describe('cropDraftRect', () => {
  it('returns a normalized rect for a crop draft', () => {
    expect(cropDraftRect(drag('crop'))).toEqual({
      x: 10, y: 10, width: 100, height: 80,
    })
  })

  it('returns null when missing, wrong tool, or degenerate', () => {
    expect(cropDraftRect(null)).toBeNull()
    expect(cropDraftRect(drag('box'))).toBeNull()
    expect(cropDraftRect(drag('crop', 11, 11))).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared/tools.test.ts`

Expected: FAIL — `documentWithDraft` / `cropDraftRect` are not exported.

- [ ] **Step 3: Implement the helpers**

In `src/shared/tools.ts`, add imports if needed:

```ts
import type { CaptureDocument } from './document'
import { isDegenerateRect, normalizeRect, type Point, type Rect } from './geometry'
```

(`Point` may already be imported; keep a single geometry import.)

Add:

```ts
const DRAFT_ANNOTATION_ID = '__draft__'

/** Temporary top annotation for on-screen paint. Never commit this id into history. */
export function documentWithDraft(
  doc: CaptureDocument,
  draft: Draft | null,
  style: ToolStyle,
): CaptureDocument {
  if (!draft) return doc
  const annotation = draftToAnnotation(draft, style, DRAFT_ANNOTATION_ID)
  if (!annotation) return doc
  return { ...doc, annotations: [...doc.annotations, annotation] }
}

/** Crop chrome rect for the editor canvas; null when not a paintable crop draft. */
export function cropDraftRect(draft: Draft | null): Rect | null {
  if (!draft || draft.tool !== 'crop') return null
  const rect = normalizeRect(draft.start, draft.current)
  return isDegenerateRect(rect) ? null : rect
}
```

- [ ] **Step 4: Run helper tests to verify they pass**

Run: `npx vitest run tests/shared/tools.test.ts`

Expected: PASS

- [ ] **Step 5: Add a render integration test**

Append to `tests/shared/render.test.ts`:

```ts
import { documentWithDraft, updateDraft, beginDraft } from '@shared/tools'

it('paints a draft box on top when the document includes documentWithDraft', () => {
  const { ctx, ops } = createMockContext()
  const style = { color: '#ff3b30', strokeWidth: 3, fontSize: 18 }
  const draft = updateDraft(beginDraft('box', { x: 10, y: 10 }), { x: 110, y: 90 })
  const doc = documentWithDraft(createDocument('d', 800, 600), draft, style)
  renderDocument(ctx, image, doc, factory())
  expect(ops).toContainEqual({ name: 'strokeRect', args: [10, 10, 100, 80] })
  const imageIdx = ops.findIndex((op) => op.name === 'drawImage')
  const strokeIdx = ops.findIndex((op) => op.name === 'strokeRect')
  expect(imageIdx).toBeGreaterThanOrEqual(0)
  expect(strokeIdx).toBeGreaterThan(imageIdx)
})
```

- [ ] **Step 6: Run render tests**

Run: `npx vitest run tests/shared/render.test.ts`

Expected: PASS (no production change required — proves the paint path).

- [ ] **Step 7: Commit**

```bash
git add src/shared/tools.ts tests/shared/tools.test.ts tests/shared/render.test.ts
git commit -m "feat: add documentWithDraft helpers for live preview"
```

---

### Task 2: Wire editor canvas render (and crop chrome)

**Files:**
- Modify: `src/renderer/editor/canvas-view.ts`

**Interfaces:**
- Consumes: `documentWithDraft`, `cropDraftRect` from `@shared/tools`; `currentDocument` from `@shared/editor-state`
- Produces: on-screen `render` shows drafts; `renderTo` unchanged (no draft)

- [ ] **Step 1: Update imports in `canvas-view.ts`**

```ts
import { documentWithDraft, cropDraftRect } from '@shared/tools'
```

- [ ] **Step 2: Paint drafts in `render`, keep `renderTo` clean**

Replace the body of `render` so the document passed to `renderDocument` includes the draft, then draw crop chrome after selection (or before — either is fine; crop chrome should be after `renderDocument`):

```ts
render(state: EditorState): void {
  if (!image) return
  const doc = documentWithDraft(currentDocument(state), state.draft, state.style)
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
  drawCropDraft(ctx, state)
  ctx.restore()
},
```

Keep `renderTo` exactly as today:

```ts
renderDocument(target, image, currentDocument(state), browserCanvasFactory)
```

Add `drawCropDraft` next to `drawSelection`:

```ts
function drawCropDraft(ctx: CanvasRenderingContext2D, state: EditorState): void {
  const rect = cropDraftRect(state.draft)
  if (!rect) return
  ctx.save()
  ctx.strokeStyle = SELECTION_COLOR
  ctx.lineWidth = 1 / currentScale
  ctx.setLineDash([4 / currentScale, 3 / currentScale])
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
  ctx.restore()
}
```

Note: `drawSelection` still uses `currentDocument(state)` (not the draft-augmented doc) so selection chrome is unaffected.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`

Expected: no errors

- [ ] **Step 4: Run shared tests + e2e**

Run: `npm test && npm run e2e`

Expected: all unit/integration tests pass; all three e2e tests pass.

- [ ] **Step 5: Manual smoke (editor)**

Run: `npm run dev`

- Open a capture, choose Box, drag — red outline must appear **while** dragging.
- Repeat for Arrow, Highlight, Blur.
- Choose Crop, drag — blue dashed rect while dragging.
- Copy / confirm autosave PNG has no leftover draft chrome after canceling a drag (Esc / mouseleave clears draft today).

- [ ] **Step 6: Commit**

```bash
git add src/renderer/editor/canvas-view.ts
git commit -m "feat: paint live drafts on the editor canvas"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Live box/arrow/highlight/blur outline while dragging | Task 1 + 2 |
| Crop draft outline | Task 2 (`drawCropDraft`) |
| Draft on top of capture (after image) | Task 1 render order test + `documentWithDraft` append |
| No draft in export/autosave/copy | Task 2 (`renderTo` unchanged) |
| Degenerate drafts invisible | Task 1 tests |
| No size labels / handles during draft | Non-goal — no task adds them |
| Existing e2e still passes | Task 2 Step 4 |

## Placeholder scan

None — helpers, canvas wiring, commands, and expected results are fully specified.
