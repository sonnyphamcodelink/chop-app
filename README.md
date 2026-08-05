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
