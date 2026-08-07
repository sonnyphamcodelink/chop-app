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

## Updates

Chop checks for a newer version at launch and from the tray's
**Check for Updates…**, then points you at the release page. It does not install
updates itself: the macOS build is ad-hoc signed, and Squirrel's in-place
update requires a Developer ID signature.

Because this repo is private, release metadata lives in a separate public repo,
`sonnyphamcodelink/chop-releases` — see `RELEASES_REPO` in
`src/main/updates/release-feed.ts`. Nothing but a public URL ships in the app,
so there is no token to leak.

To publish a release:

1. Bump `version` in `package.json` and commit it.
2. `npm run package`
3. Upload `release/Chop-<version>*.dmg` to a new release in the releases repo,
   tagged `v<version>` — the tag is what the running app compares against.

## Develop

    npm run dev             # run the app
    npm test                # unit and integration tests
    npm run test:coverage   # enforce the 80% floor on src/shared
    npm run e2e             # end-to-end tests
    npm run typecheck
    npm run build:icons     # re-render the app and tray icons from the mark

Platform-specific code that cannot run in CI is covered by
`docs/manual-smoke-tests.md`.

## Brand

The Chop mark lives in `scripts/logo.mjs`. `npm run build:icons` renders it into
`resources/logo.svg`, `build/icon.png` (app and installer icon) and the
`resources/tray-icon*.png` template images; all four are checked in, so run it
only after changing the mark.
