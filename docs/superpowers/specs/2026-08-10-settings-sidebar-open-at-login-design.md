# Settings sidebar + Open at Login

Date: 2026-08-10  
Status: approved

## Problem

1. **Open at Login** lives in the tray menu. It is a preference, not a frequent
   action, and the tray should stay focused on capture/editor actions.
2. The Settings window is a single-purpose Shortcuts panel. It needs a layout
   that can hold more preferences without redesigning the window each time.

## Goals

- Move Open at Login out of the tray and into Settings (Settings only).
- Redesign Settings with a **sidebar** so General and Shortcuts are separate
  panes; default open pane is **General**.
- Keep the existing macOS login-item approval dialog when enabling needs
  System Settings approval.
- Preserve today’s Capture shortcut recorder behavior in the Shortcuts pane.

## Non-goals

- Keeping Open at Login in the tray as a duplicate control.
- Config-driven pane registry or separate HTML documents per pane.
- Inline approval banner instead of the existing dialog.
- Remembering the last-selected pane across launches.
- Adding other General preferences beyond Open at Login in this change.
- Making the Settings window resizable or introducing a new UI framework.

## Decisions

| Topic | Choice |
| --- | --- |
| Tray | Remove Open at Login entirely |
| Layout | Sidebar (General \| Shortcuts) |
| Default pane | General |
| Approval UX | Existing dialog (Open System Settings / Later) |
| Implementation | Extend the current settings HTML/TS shell |

## Design

### 1. Tray

- Remove `openAtLogin` / `onToggleOpenAtLogin` from `TrayHandlers`.
- Remove `openAtLoginItems` and the checkbox menu entry (and its separator).
- Tray template remains: Capture, Open Editor, Open Captures Folder, Settings…,
  version, Check for Updates…, Quit.

### 2. Settings UI

- Single window shell with a left sidebar and a content area.
- Sidebar entries: **General**, **Shortcuts**. Clicking switches visible pane;
  only one pane is shown at a time.
- Opens on **General**.
- Window stays non-resizable; size **600 × 380** so sidebar + content fit
  without crowding.
- Visual language stays aligned with the current settings page (system font,
  light/dark `color-scheme`, muted borders/fields).

**General pane**

- Row: label “Open at Login” + a **switch** (checked only when state is
  `enabled`).
- On platforms where login items are unsupported (`unsupported`), hide the
  switch and show a short note that the preference is unavailable.
- Switch state always reflects what main returns after get/set (OS is source of
  truth). Treat `requires-approval` and `disabled` as off in the UI.

**Shortcuts pane**

- Existing Capture row, Restore Default, status hints, and footer copy.
- Behavior unchanged (record, refuse conflicts, Escape / blur / close resume
  the global hotkey).

### 3. Architecture & data flow

```
Settings renderer  →  preload (chopSettings)  →  IPC  →  login-item.ts
                                                          (dialog on requires-approval)
```

- Add IPC channels, e.g. `getOpenAtLogin` / `setOpenAtLogin`, returning
  `LoginItemState` (`enabled` \| `disabled` \| `requires-approval` \|
  `unsupported`).
- Register handlers beside existing shortcut handlers in
  `settings-handlers.ts`. Handlers call `openAtLoginState()` /
  `setOpenAtLogin()`; approval dialog logic stays inside `login-item.ts`.
- Extend `src/preload/settings.ts` with get/set for login item state.
- Renderer: sidebar shell in `settings/index.html` + `main.ts`; General wires
  the toggle; Shortcuts keeps the recorder (extract a small module only if
  `main.ts` becomes hard to read).
- `src/main/index.ts`: stop passing login-item handlers into `createTray`.

### 4. Errors

- Failed or partial OS writes: UI syncs to returned state; do not leave an
  optimistic on switch that disagrees with the OS.
- `requires-approval` while enabling: show the existing dialog; after dismiss,
  switch stays off until the user allows Chop in System Settings and Chop
  reports `enabled` again.
- Shortcut errors: unchanged.

### 5. Testing

**Automated**

- Tray tests: assert Open at Login is gone.
- Settings/login IPC: get/set cover enabled, disabled, unsupported, and
  requires-approval (reuse existing login-item fakes/patterns).
- Optional light renderer coverage for pane switching / toggle wiring if it
  fits current test style; otherwise IPC + tray are enough for this change.

**Manual smoke (`docs/manual-smoke-tests.md`)**

- Settings opens on General; Open at Login toggles correctly.
- Approval dialog still appears when macOS requires it.
- Tray no longer lists Open at Login.
- Shortcuts pane still matches the existing Capture shortcut checklist.

## Out of scope follow-ups

- Additional General prefs (launch behavior, update channel, etc.).
- Persisting last-selected Settings pane.
- Sidebar icons or search.
