# Chop — Screen Capture and Annotation Tool

**Date:** 2026-08-04
**Status:** Approved design

## Purpose

A personal replacement for Snagit: capture a screen region or a window with one
click, annotate it with basic markup tools, and get it into the clipboard or a
folder without ceremony. Built for a single user on a personal machine, not for
distribution.

## Scope

### In scope (V1)

- Region capture by drag
- Window capture by hover-and-click, with the window under the cursor highlighted
- The editor opens automatically after every capture — there is no separate
  "capture silently" path
- Annotation tools: box, arrow, text, highlighter, blur, crop
- Auto-save to a local folder, timestamped
- Filmstrip of past captures along the bottom of the editor, reopenable and
  re-editable
- Copy to clipboard via keyboard shortcut
- macOS and Windows installers, macOS being the primary target

### Explicitly out of scope

- Scrolling capture (per-application scroll automation plus image stitching)
- Screen recording, video, and GIF
- Ellipse and step-number annotation tools
- Cloud upload, sharing, and accounts
- OCR and text extraction

Out-of-scope items are deferred, not rejected. The architecture should not
foreclose them, but no code is written for them in V1.

## Stack

Electron with TypeScript. Chosen by the user over Tauri and native Swift.

The known trade-offs, recorded so they are not rediscovered later: installers are
large (100 MB or more), runtime memory is heavier than a native app, and
`desktopCapturer` does not expose window geometry, so a native layer is required
regardless. That native layer is deliberately kept small and isolated (see
"Native window provider").

The renderer uses HTML canvas for the editor. Canvas provides the object model,
hit-testing, and cheap redraw that an annotation editor needs.

## Architecture

### Core decision: freeze-frame capture

When the capture hotkey fires, every display is screenshotted at full resolution
*before* any UI appears. The overlay then draws on those frozen images.

This follows from the one-click window requirement. Highlighting the window under
the cursor means redrawing a rectangle on every mouse move. Against a live screen
that repaints continuously, the highlight flickers and races the compositor.
Against a frozen image it is smooth and trivial.

Freeze-frame also guarantees the overlay UI can never appear in the captured
image, and makes multi-display capture behave identically to single-display.

### Capture flow

1. Global hotkey fires in the main process. Default `Cmd+Shift+2` on macOS,
   `Ctrl+Shift+2` on Windows.
2. Main checks macOS Screen Recording permission via
   `systemPreferences.getMediaAccessStatus('screen')`. If not granted, open the
   relevant System Settings pane with instructions and abort the capture.
3. `desktopCapturer.getSources({ types: ['screen'] })` is called with
   `thumbnailSize` set to each display's `size × scaleFactor`, yielding true
   physical-pixel images rather than thumbnails.
4. The window provider is queried for on-screen window rectangles in z-order,
   front to back.
5. One frameless, transparent, always-on-top overlay `BrowserWindow` is opened
   per display, positioned at that display's bounds, and handed the frozen image
   and the window rectangle list.
6. The overlay dims the frozen image. Cursor movement hit-tests the topmost
   window rectangle containing the pointer and draws a highlight with a size
   label. Click selects that window. Drag selects a freeform region with live
   dimensions. `Esc` cancels every overlay.
7. The chosen rectangle returns to main, which crops the full-resolution frozen
   image and opens the editor with the result.

### Module layout

```
src/main/                Electron main process
  hotkeys/               global shortcut registration
  permissions/           macOS screen recording checks and guidance
  capture/               desktopCapturer orchestration, overlay lifecycle
  window-providers/      platform-specific window geometry (see below)
  storage/               file writing, manifest, thumbnails
  ipc/                   typed channel definitions and handlers
src/overlay/             frozen-image renderer, hit-testing, selection UI
src/editor/              canvas editor, tool palette, filmstrip
src/shared/              types, annotation model, coordinate math
```

`src/shared/` must not import Electron. It is pure TypeScript so it can be unit
tested directly.

Files stay focused; target 200–400 lines, 800 maximum. Organize by feature, not
by file type.

### Native window provider

`desktopCapturer` enumerates windows but returns no geometry, so window bounds
require operating system calls. One interface, two implementations, neither
requiring the user to compile a native Node module:

```ts
interface WindowProvider {
  listWindows(): Promise<WindowRect[]>  // z-ordered, front to back
}
```

- **macOS**: a small Swift helper binary, built at package time, calling
  `CGWindowListCopyWindowInfo(.optionOnScreenOnly)` and printing JSON to stdout.
  Window *bounds* require no permission beyond what the app already holds;
  window *titles* would require Screen Recording permission on recent macOS, and
  are not needed.
- **Windows**: `koffi` (prebuilt FFI, no node-gyp) calling `EnumWindows`,
  `IsWindowVisible`, and `DwmGetWindowAttribute` with
  `DWMWA_EXTENDED_FRAME_BOUNDS` for true frame geometry.
- **Stub**: returns fixture data. Selected by environment variable so tests never
  touch the operating system.

The provider is selected at runtime by platform. No other module contains
platform-specific code.

### Coordinate math

This is the highest-risk area of the project. Failures here are subtle: a region
selected on a 2× display crops the wrong pixels, or a monitor positioned left of
the primary produces negative origins that silently clamp to zero.

All coordinate conversion lives in a single pure module in `src/shared/`, with no
Electron imports:

- Device-independent pixels to physical pixels and back, per display
- Global desktop coordinates to per-display local coordinates
- Rectangle intersection and clamping to display bounds

It is written test-first against fabricated multi-display layouts, including
negative origins and mixed scale factors.

## Editor

### Document model

A capture is a document, not a bitmap being mutated:

```ts
type Document = {
  sourceImage: ImageRef
  cropRect: Rect | null
  annotations: readonly Annotation[]
}

type Annotation =
  | { id: string; kind: 'box';       rect: Rect;  color: string; strokeWidth: number }
  | { id: string; kind: 'arrow';     from: Point; to: Point; color: string; strokeWidth: number }
  | { id: string; kind: 'text';      at: Point;   text: string; color: string; fontSize: number }
  | { id: string; kind: 'highlight'; rect: Rect;  color: string }
  | { id: string; kind: 'blur';      rect: Rect }
```

Annotations are stored in image coordinates, never screen coordinates, so zoom
and crop cannot corrupt their positions.

Rendering is a pure function `render(ctx, doc)` that redraws from scratch each
frame.

Crop is a document property rather than an annotation. This makes it
non-destructive and undoable: un-cropping restores the full image with every
annotation still correctly positioned.

All state updates are immutable — every edit produces a new document rather than
mutating the existing one.

### Undo and redo

A capped array of document snapshots, default limit 50. Because documents are
immutable and `sourceImage` is a shared reference rather than a copy, snapshots
are cheap. No command-pattern machinery.

### Tool implementation notes

- **Blur is implemented as pixelation**, not a gaussian blur. A low-radius
  gaussian is partially reversible, which is the wrong property for a tool whose
  purpose is hiding credentials. Rendered by drawing the source region into an
  offscreen canvas at reduced resolution and scaling it back up with
  `imageSmoothingEnabled = false`. The user-facing label remains "Blur".
- **Highlighter** draws a translucent rectangle with `multiply` composite
  operation so underlying text stays readable.
- **Text** uses a real HTML input positioned over the canvas during editing,
  committed to an annotation on Enter or blur. Canvas has no native text entry.
- **Arrow** draws a line with a filled triangular head, sized proportionally to
  stroke width.

### Selection and manipulation

Annotations remain selectable after being drawn: click to select, drag to move,
corner handles to resize rectangles, `Delete` to remove. Without this, a slightly
misplaced arrow forces an undo and a redraw.

Rotation, layer reordering, and grouping are out of scope.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+Shift+2` | Capture (global) |
| `Cmd/Ctrl+C` | Copy flattened PNG to clipboard |
| `Cmd/Ctrl+S` | Save As |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` | Redo |
| `Delete` | Delete selected annotation |
| `Cmd/Ctrl+W` | Close editor (already auto-saved) |
| `Esc` | Cancel capture overlay |

### Menu bar / tray

A tray icon with Capture, Open Folder, Preferences, and Quit.

## Storage and history

Captures are written to `~/Pictures/Chop` by default, configurable, saved the
moment the capture is taken and named by timestamp:

```
~/Pictures/Chop/
  2026-08-04 15-42-07.png        flattened, this is the shareable file
  .chop/
    originals/2026-08-04 15-42-07.png    unannotated source
    docs/2026-08-04 15-42-07.json        annotation document
    thumbs/2026-08-04 15-42-07.png       256 px filmstrip thumbnail
    manifest.json                        filmstrip index
```

Keeping the original alongside the annotation document is what makes the
filmstrip useful: clicking a past capture reopens it fully re-editable — move an
arrow, change a color — rather than only allowing new marks on a flattened image.

The manifest exists so the filmstrip does not decode the entire folder on every
launch. It is the source of truth for filmstrip ordering; a rebuild-from-disk
path handles a missing or corrupt manifest.

Annotated documents re-save over the flattened PNG, debounced at 800 ms after the
last edit, and again on editor close. The original is never overwritten.

The filmstrip runs along the bottom of the editor window, newest first.

### Editor window lifecycle

There is exactly one editor window. It is created on first capture and reused
thereafter: a new capture loads into the existing window and brings it to the
front, rather than opening a second window. Because the outgoing document is
already saved, replacing its contents loses nothing. Closing the window does not
quit the application — the tray icon and global hotkey remain active.

## Error handling

Errors are handled explicitly at every level and never silently swallowed.

| Failure | Behavior |
|---|---|
| Screen Recording permission denied | Open the exact System Settings pane with instructions; abort capture |
| Disk write fails | Keep image in memory, show error, offer Save As |
| Window provider errors or times out | Degrade to region-only selection; capture still works, one-click window grab is lost |
| Manifest missing or corrupt | Rebuild by scanning the capture directory |
| Overlay fails on one display | Continue on remaining displays rather than aborting entirely |

The window provider is given a timeout so a hung helper process cannot block
capture.

## Testing

Test-driven: tests are written before implementation. Minimum 80% coverage.

- **Unit (Vitest)** — `src/shared/`: coordinate math against fabricated
  multi-display layouts including negative origins and mixed scale factors;
  annotation reducers; hit-testing; manifest logic. This is pure code and carries
  the bulk of the coverage.
- **Integration** — the storage module against a temporary directory using a real
  filesystem; IPC channel contract tests.
- **End-to-end (Playwright Electron driver)** — launch the app with the stub
  window provider and a stub capture source injected by environment variable;
  perform a capture, draw a box, save, and assert both the output file and the
  manifest entry.

The native window providers cannot run in CI. They get a short manual smoke
checklist rather than tests that pretend to exercise them.

## Packaging

`electron-builder` producing a DMG for macOS (arm64 and x64) and an NSIS
installer for Windows.

**Known macOS friction:** Screen Recording permission is bound to an
application's code signature. Ad-hoc signed builds re-prompt for permission after
rebuilds, and Gatekeeper requires a right-click → Open on first launch. This is
acceptable for personal use. A Developer ID certificate eliminates both issues.

## Open decisions deferred to implementation

None. All design questions are resolved above.
