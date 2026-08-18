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

## Licensing

Chop runs unrestricted for 30 days, then wants a licence key before it will
capture again. Editing past captures is never blocked.

Keys are signed with Ed25519 and verified inside the app, so activation works
offline and there is no licence server to run or pay for. The app ships only the
public key; the private half signs keys on your machine and must never be
committed — anyone holding it can mint licences.

Set up once:

    npm run license:keygen

Paste the public half into `LICENSE_PUBLIC_KEY` in
`src/main/license/public-key.ts` and commit it. Store the private half where you
keep secrets. `npm run package` refuses to build until a key is set, because a
keyless build rejects every licence ever sold.

To issue a key after a sale:

    CHOP_LICENSE_PRIVATE_KEY=<private key> \
      npm run license:sign -- --email buyer@example.com --id ORDER-1043

Add `--days 365` for a term licence; omit it for a perpetual one. Paste the key
it prints into the receipt. Run it by hand for early sales, or call it from your
store's purchase webhook later. `PURCHASE_URL` in
`src/main/license/purchase.ts` is where the app's "Buy Chop" buttons point.

To exercise the end of the trial without waiting a month, a development build
reads `CHOP_TRIAL_STARTED_AT` — an ISO instant, or a day count back from now:

    CHOP_TRIAL_STARTED_AT=-31d npm run dev    # trial ended
    CHOP_TRIAL_STARTED_AT=-28d npm run dev    # two days left

A packaged build ignores it, as it ignores `CHOP_LICENSE_PUBLIC_KEY`; otherwise
resetting a trial would be an environment variable away. To put a *packaged*
build into a given state, edit the licence file it actually reads:

    npm run trial                 # what the installed app currently sees
    npm run trial -- expired      # trial ended, capture refused
    npm run trial -- ending       # two days left
    npm run trial -- fresh        # first run: no key, no stamp
    npm run trial -- unlicense    # drop the key, keep the trial stamp
    npm run trial -- days-ago 20

Quit Chop first — it caches the file in memory and would write its copy back
over yours.

Two things this deliberately does not do. It cannot revoke a key or cap how many
machines use one — that needs a server, and offline activation was worth more.
And the check runs inside the app, so anyone willing to edit the bundle can
defeat it; deleting `license.json` likewise restarts the trial. This is a
receipt, not a lock.

Before selling, note that the macOS build is ad-hoc signed. Gatekeeper will make
buyers right-click to open it. Shipping properly needs a Developer ID
certificate and notarization, which is a separate piece of work from this one.

## Updates

Chop checks for a newer version at launch and from the tray's
**Check for Updates…**. When one is available, Chop downloads the installer in
the background, verifies its size and GitHub-provided SHA-256 digest, and stages
the matching Apple Silicon or Intel build without interrupting startup. Once it
is ready, Settings and the main editor show **Relaunch to Update**. That explicit action
quits Chop, atomically replaces the installed app, and reopens it.

Automatic replacement requires Chop to be installed as `Chop.app` on a writable
local volume. A copy launched directly from the DMG or through macOS App
Translocation must first be moved to Applications.

Because this repo is private, release metadata lives in a separate public repo,
`sonnyphamcodelink/chop-releases` — see `RELEASES_REPO` in
`src/main/updates/release-feed.ts`. Nothing but a public URL ships in the app,
so there is no token to leak.

To publish a release:

1. Bump `version` in `package.json` and commit it.
2. `npm run package`
3. Upload the built artifacts to a new release in the releases repo, tagged
   `v<version>` — the tag is what the running app compares against. GitHub must
   report a SHA-256 digest for each asset; Chop refuses to install an asset
   without one.

Artifact names carry no version on purpose:

    Chop-mac-arm64.dmg
    Chop-mac-x64.dmg
    Chop-win-x64.exe

The landing page links at `releases/latest/download/<name>`, a permanent URL
that resolves to whatever the newest release published under that exact name.
That is what makes its Download button download the file rather than send
someone to GitHub — so renaming an artifact silently breaks it. The site's
`npm run check:downloads` asks GitHub whether these names really exist, and
fails its build when one is missing.

## Feedback

Tray "Send Feedback…" and the Feedback pane in Settings post a note — an idea or
a problem — to `FEEDBACK_URL` in `src/main/feedback/endpoint.ts`. Change that to
your own endpoint before shipping. It takes a `multipart/form-data` POST:

    kind          "idea" or "problem"
    message       the note
    diagnostics   JSON: version, OS, arch, display count, licence kind
    capture       optional image the user pasted into the message box

Anything that accepts a form post works — a Cloudflare Worker forwarding to
email, or straight into an issue tracker. It is unauthenticated by design, so
rate-limit it on the server; nothing in the app can stop someone posting to it
directly.

Pasting an image into the message box attaches it. It arrives from the clipboard
rather than from disk, so the bytes cross the IPC boundary and are checked in
`src/shared/feedback/attachment.ts` before anything is sent: PNG, JPEG, GIF or
WebP, under the size cap, and real base64. Anything else is refused rather than
repaired.

Nothing is posted until the user confirms. Send raises a sheet that lists what is
actually going — the message, the image if there is one, and each diagnostics
line spelled out — because a pasted screenshot can hold anything that was on
screen and that dialog is the last place anyone can look. Backing out is its own
outcome, not a failure. Diagnostics carry the licence *kind* only, never the key
and never the buyer's email.

Chop is offline-first, so sends fail. A failed send keeps the note on screen and
offers Copy text and Email instead; the latter goes to `FEEDBACK_EMAIL` in the
same file. Drafts survive the settings window being closed — the text, not the
image, which would eat the storage quota.

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
