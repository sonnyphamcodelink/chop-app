# Live draft preview (drawing tools)

Date: 2026-08-05  
Status: approved direction (approach 1)

## Problem

While dragging a box (or arrow / highlight / blur / crop), the editor stores a
`Draft` on `EditorState` but `createCanvasView().render` only paints
`currentDocument(state)`. The user sees the capture alone until mouseup, which
feels like the annotation is missing or drawn “behind” the image.

Committed annotations already paint **after** `drawImage` in `renderDocument`,
so final z-order is correct. The gap is live feedback during the drag.

## Goal

Show a live outline (or equivalent tool preview) on top of the capture while
dragging any drawing tool. No size labels, no resize handles during the drag
(those stay select-tool-only after commit).

## Non-goals

- Dimension tooltips (`W` / `H`)
- Selection handles during draft
- Changing tool defaults, colors, or stroke widths
- Painting drafts into export / autosave / clipboard (`renderTo`)

## Approach

Paint the draft inside `createCanvasView().render` after the committed document,
reusing the same annotation drawing path as the final commit.

### Annotation drafts (box, arrow, highlight, blur)

1. After `renderDocument(ctx, image, currentDocument(state), …)` (or equivalent
   single pass — see Implementation notes), if `state.draft` is set:
2. Call existing `draftToAnnotation(state.draft, state.style, '__draft__')`.
3. If non-null, draw that annotation with the shared renderer (`drawAnnotation`
   exported, or temporarily appended as the top annotation for that paint).
4. Degenerate drags stay invisible (same null as commit).

Draft id `__draft__` is paint-only; it is never committed into history.

### Crop draft

`draftToAnnotation` returns null for crop. After the document paint, stroke the
normalized draft rect in image coordinates (editor chrome only — not saved).

### Export path

`renderTo` continues to use `currentDocument(state)` only. Drafts must not appear
in flattened PNG / autosave / copy.

## Implementation notes

Preferred shape (keeps one image paint):

- Add a small shared helper, e.g. `documentWithDraft(doc, draft, style)`, that
  returns `doc` unchanged when the draft is null/degenerate/non-annotation, else
  `{ ...doc, annotations: [...doc.annotations, annotation] }`.
- `render` uses that for the on-screen paint; `renderTo` does not.
- Export `drawAnnotation` only if a separate post-pass is cleaner than
  `documentWithDraft`; do not duplicate box/arrow/highlight/blur stroke logic in
  the renderer package.

Crop outline lives next to selection chrome in `canvas-view.ts`: dashed stroke
using the existing selection color (`#2f9bff`), not the annotation style color.

## Files

| File | Change |
|------|--------|
| `src/shared/editor-state.ts` or `src/shared/tools.ts` | optional `documentWithDraft` helper |
| `src/shared/render.ts` | export `drawAnnotation` only if needed |
| `src/renderer/editor/canvas-view.ts` | paint draft (and crop outline) in `render` |
| `tests/shared/…` | cover helper / draft inclusion |
| `tests/renderer` or shared render tests | assert draft annotation is drawn when present |

## Acceptance

- Dragging box / arrow / highlight / blur shows the in-progress shape on top of
  the capture before mouseup.
- Crop drag shows a rect outline while dragging.
- Mouseup still commits via the existing `draftToAnnotation` + `commitDocument`
  path; undo removes the committed annotation only.
- Copy / autosave / export never include an in-progress draft.
- Existing selection handles and e2e box drawing still pass.

## Out of scope follow-ups

- Size label during drag (Snagit-style `W` / `H`)
- Auto-select newly drawn annotation and show handles immediately
