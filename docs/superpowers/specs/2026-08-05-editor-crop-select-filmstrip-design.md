# Editor: remove Select, crop session, filmstrip width

Date: 2026-08-05  
Status: approved

## Problem

1. The **Select** tool does not match how people use Chop. Moving and resizing
   annotations after draw is unused friction; the toolbar entry and `V`
   shortcut should go away.
2. **Crop** today is a one-shot drag-to-draw rect. Users expect image-style
   crop: a frame on the full capture, resize from corners/edges, live preview
   of what stays vs what is cut, apply when the mouse releases.
3. The bottom **history filmstrip** sizes thumbs by fixed height only, so widths
   vary with aspect ratio. Items should share one fixed width; height follows
   the image.

## Goals

- Remove Select and all annotation selection / move / resize / delete-selected.
- Crop tool: full-image session with handles, dimmed exterior, commit on mouseup.
- Filmstrip: fixed thumb width, auto height from aspect ratio.

## Non-goals

- Reintroducing annotation edit after place (move/resize/select).
- Separate Confirm / Enter to apply crop (mouseup applies).
- Destructive pixel crop of the source file (keep non-destructive `cropRect`).
- Filmstrip `cover` / letterboxed fixed boxes (height stays aspect-driven).
- Changing other drawing tools’ drag behavior or export paths.

## Design

### 1. Remove Select

- Remove `select` from `ToolId`, toolbar buttons, and the `V` shortcut.
- Default tool for a new editor session: **`box`**.
- Delete selection state and UI:
  - `selectedId` on `EditorState` (and helpers such as `selectAnnotation`,
    `deleteSelected`)
  - Selection chrome and handles in `canvas-view`
  - Select / move / resize gesture paths in `interactions`
  - Delete-key “delete selected” wiring in the editor
- Drawing tools still create annotations on drag; once committed they are
  immutable except via **Undo** / **Redo**.

### 2. Crop session (approach: full-image overlay)

**Enter Crop**

- While `tool === 'crop'`, the editor paints the **full original** image
  (layout ignores the committed `cropRect`).
- A **working crop rect** starts as the current `cropRect`, or the full image
  bounds if `cropRect` is null.
- Paint: dimmed overlay outside the working rect; clear interior; dashed frame;
  corner and edge resize handles (reuse existing handle hit-testing geometry).

**Interact**

- Drag a handle → update the working rect live (clamp to image bounds; enforce
  a small minimum size so the rect never degenerates).
- Drag inside the frame → move the working rect (clamped).
- Empty click / drag that does not start on a handle or the frame does not
  start a new draw-rect crop.
- Switching away from Crop without a completed gesture leaves the document
  unchanged (working rect discarded).

**Apply**

- On **mouseup** after a handle resize or move gesture, commit
  `setCrop(doc, workingRect)` via `commitDocument` (one undo step).
- In-progress crop chrome must not appear in Copy / autosave / `renderTo`.

**Re-crop**

- Entering Crop again shows the full original with the last committed crop as
  the starting frame, so the user can enlarge or shrink again.

**State shape (implementation note)**

- Prefer an explicit crop-session field (working rect + optional active handle)
  over overloading the annotation `Draft` drag model, since crop no longer
  begins from two drag points.
- Keep committed storage as today’s non-destructive `CaptureDocument.cropRect`.

### 3. Filmstrip fixed width

- CSS on `#filmstrip img`: set a fixed `width` matching the visual width of a
  typical current landscape thumb at 56px height (~100px CSS; tune to match
  the selected item in the current UI).
- `height: auto` so aspect ratio is preserved (portrait taller, landscape
  shorter).
- Keep gap, scroll, active blue border, and click-to-open behavior.

## Architecture / files

| Area | Likely files |
|------|----------------|
| Tool id / defaults | `src/shared/tools.ts`, `src/shared/editor-state.ts` |
| Toolbar / shortcuts | `src/renderer/editor/toolbar.ts`, `src/renderer/editor/main.ts` |
| Gestures | `src/renderer/editor/interactions.ts` |
| Crop chrome + full-image paint | `src/renderer/editor/canvas-view.ts` |
| Filmstrip layout | `src/renderer/editor/index.html` |
| Tests | `tests/shared/editor-state.test.ts`, tools/interactions-related tests; add crop-session commit/resize coverage; remove select assertions |

### Data flow

```
Crop tool active
  → working rect in editor session state (not history)
  → canvas paints full image + dim + handles
  → mouseup after resize/move
  → commitDocument(setCrop(...))
  → normal tools / export use committed cropRect via outputSize / renderDocument
```

## Acceptance

- No Select button or `V` shortcut; default tool is Box.
- Annotations cannot be selected, moved, resized, or deleted via Delete.
- Entering Crop shows full capture, dimmed outside, handles on the frame.
- Dragging a corner/edge updates the frame live; mouseup applies the crop.
- Undo restores the previous crop; re-entering Crop allows enlarging again.
- Copy / export never include crop handles or dim overlay.
- Filmstrip thumbs share one fixed width; heights vary with aspect ratio.

## Out of scope follow-ups

- Annotation edit after place
- Explicit Confirm / Cancel crop chrome
- Fixed-height filmstrip cells with `object-fit: cover`
